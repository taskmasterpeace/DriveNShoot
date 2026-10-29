// THE HUD LAYOUT AS ROWS (docs/design/WEB_UI_EDITOR.md). One row per HUD element: a stable id, the name the editor and
// the screenshot sheet print, the corner or edge it hangs from, its offset from there, its own scale, whether it shows,
// and the situations it shows in. ui/hudedit.js places every element from its row (anchored, so any window size or
// aspect keeps it on screen); the HUD editor (F6, or EDIT HUD in the pause menu) edits a player's copy, saved on this
// machine; EXPORT gives rows in this exact shape so a new standard layout is a paste into HUD_LAYOUT below.
//
// A row:
//   id          stable key (saves, the `hud` command and the selftest use it; never rename one)
//   name        what the editor's label and the screenshot sheet call it
//   group       navigation | vitals | combat | social | messages | vehicle (the editor colours its outline by group)
//   sel         CSS selector of the element under #ui (the HUD, the feedback layer and the weapon bar build them)
//   anchor      tl tc tr ml mc mr bl bc br: the screen corner or edge it hangs from ('mouse': follows the pointer)
//   x, y        offset from that anchor in DESIGN px (1600x900 at layout scale 1), measured inward from the edge it hangs on;
//               for a centred axis (tc, bc, ml, mr, mc) +x is right / +y is down from the centre line
//   scale       this element's own size on top of the layout scale (0.4 .. 2.5)
//   visible     false hides it in every situation
//   situations  where it shows (SITUATIONS below); anywhere else it is hidden
//   w, h        the slot it reserves in design px (an empty kill feed or a hidden prompt still has a place to drag)
//   talkHide    fades out while a conversation holds the bottom of the screen
//
// The layout scale: fitScale(W, H) (1.0 at 1600x900, clamped 0.62..1.35) x the HUD size setting x the preset's scale.
// Default's preset scale is 0.75: Robert, 2026-10-28, "a lot of the stuff ... is too big on the screen".

export const ANCHORS = {
  tl: { ax: 0, ay: 0, name: 'top left' }, tc: { ax: 0.5, ay: 0, name: 'top centre' }, tr: { ax: 1, ay: 0, name: 'top right' },
  ml: { ax: 0, ay: 0.5, name: 'middle left' }, mc: { ax: 0.5, ay: 0.5, name: 'centre' }, mr: { ax: 1, ay: 0.5, name: 'middle right' },
  bl: { ax: 0, ay: 1, name: 'bottom left' }, bc: { ax: 0.5, ay: 1, name: 'bottom centre' }, br: { ax: 1, ay: 1, name: 'bottom right' },
};

// Where the player is decides what the HUD shows. One at a time, first match wins (situationOf in ui/hudedit.js):
// dead > menu > panel > driving > passenger > deck > prone > night > on_foot.
export const SITUATIONS = {
  on_foot: { name: 'On foot', blurb: 'walking the street in daylight' },
  driving: { name: 'Driving', blurb: 'at the wheel: the dash replaces the gun plate' },
  passenger: { name: 'Passenger / turret', blurb: 'a passenger seat or the roof gun: your gun and the car\'s dash' },
  deck: { name: 'On a deck', blurb: 'riding a pickup bed, a van, a boat or a roof: the footing chip matters' },
  prone: { name: 'Prone', blurb: 'flat on the ground' },
  menu: { name: 'In a menu', blurb: 'the pause menu or the map is open: only where and when' },
  panel: { name: 'Panel open', blurb: 'the workshop, the pack, the sheet, the crew or a travel board fills the middle: the HUD steps out of its way (a row that should stay lists panel)' },
  night: { name: 'Night', blurb: 'on foot after dark (the same set as on foot; check it reads in the dark)' },
  dead: { name: 'Dead', blurb: 'down: what killed you and the clock' },
};
export const SITUATION_IDS = Object.keys(SITUATIONS);

const ALL = SITUATION_IDS.filter((s) => s !== 'panel'); // 'panel' is opt-in: a full panel open keeps only what a row asks for
const PLAY = ['on_foot', 'driving', 'passenger', 'deck', 'prone', 'night'];   // every living, unpaused situation
const FOOT = ['on_foot', 'passenger', 'deck', 'prone', 'night'];              // anywhere you hold your own gun

export const HUD_LAYOUT = [
  // ---- navigation: where you are and where you're going ----
  { id: 'minimap', name: 'Minimap', group: 'navigation', sel: '.mm', anchor: 'bl', x: 8, y: 6, scale: 1, visible: true, situations: PLAY, w: 232, h: 246 },
  { id: 'sign', name: 'Location sign', group: 'navigation', sel: '.sign', anchor: 'bl', x: 248, y: 147, scale: 1, visible: true, situations: [...PLAY, 'menu'], w: 352, h: 112 },
  { id: 'compass', name: 'Compass ribbon', group: 'navigation', sel: '.fb-compass', anchor: 'tc', x: 0, y: 9, scale: 1, visible: true, situations: PLAY, w: 540, h: 36 },
  { id: 'objective', name: 'Orders (objective)', group: 'navigation', sel: '.obj-slot', anchor: 'tl', x: 14, y: 0, scale: 1, visible: true, situations: PLAY, w: 316, h: 256 },
  // ---- the world's clock and what it thinks of you ----
  { id: 'clock', name: 'Clock, weather and wanted', group: 'social', sel: '.wx-plate', anchor: 'tr', x: 12, y: 10, scale: 1, visible: true, situations: ALL, w: 272, h: 166 },
  { id: 'respect', name: 'Respect chips', group: 'social', sel: '.respect', anchor: 'tr', x: 12, y: 185, scale: 1, visible: true, situations: [...FOOT, 'menu'], w: 272, h: 86 },
  { id: 'cash', name: 'Cash plate', group: 'social', sel: '.cash-plate', anchor: 'tr', x: 12, y: 280, scale: 1, visible: true, situations: [...PLAY, 'menu'], w: 226, h: 112 },
  { id: 'killfeed', name: 'Kill feed', group: 'messages', sel: '.kill-slot', anchor: 'tr', x: 12, y: 402, scale: 1, visible: true, situations: [...PLAY, 'dead'], w: 300, h: 100 },
  { id: 'pulls', name: 'Pulls chip', group: 'social', sel: '.pulls-chip', anchor: 'tr', x: 12, y: 512, scale: 1, visible: true, situations: [...PLAY, 'menu'], w: 284, h: 40 }, // why go out today: what reached you (ui/pullsboard.js)
  { id: 'kit', name: 'Kit chip (goggles, glass, torch, scanner, mask)', group: 'vitals', sel: '.kit-chip', anchor: 'tr', x: 12, y: 558, scale: 1, visible: true, situations: PLAY, w: 300, h: 26 }, // what is switched on and its charge (systems/kit.js)
  { id: 'radiofeed', name: 'Radio feed', group: 'messages', sel: '.rf-feed', anchor: 'tr', x: 12, y: 592, scale: 1, visible: true, situations: [...PLAY, 'menu'], w: 330, h: 96 }, // the world feed's last lines on the air (ui/radiofeed.js)
  { id: 'feed', name: 'Messages', group: 'messages', sel: '.feed', anchor: 'tl', x: 24, y: 268, scale: 1, visible: true, situations: ALL, w: 330, h: 120 },
  // ---- you ----
  { id: 'status', name: 'Health and stamina', group: 'vitals', sel: '.status', anchor: 'bl', x: 244, y: 6, scale: 1, visible: true, situations: PLAY, w: 432, h: 132, talkHide: true },
  { id: 'needs', name: 'Food, water and rest', group: 'vitals', sel: '.needs-plate', anchor: 'bl', x: 682, y: 6, scale: 1, visible: true, situations: PLAY, w: 262, h: 132, talkHide: true },
  { id: 'flag', name: 'Your flag', group: 'vitals', sel: '.flagpatch', anchor: 'bl', x: 950, y: 22, scale: 1, visible: true, situations: [...PLAY, 'menu'], w: 132, h: 86, talkHide: true },
  { id: 'ailments', name: 'Ailments', group: 'vitals', sel: '.ailments', anchor: 'bl', x: 950, y: 116, scale: 1, visible: true, situations: PLAY, w: 170, h: 90, talkHide: true },
  { id: 'telltales', name: 'Telltales (needs and ailments)', group: 'vitals', sel: '.tt-rail', anchor: 'tc', x: 0, y: 52, scale: 1, visible: true, situations: PLAY, w: 420, h: 70 },
  { id: 'roles', name: 'Role tapes', group: 'social', sel: '.roles', anchor: 'bl', x: 612, y: 147, scale: 1, visible: true, situations: FOOT, w: 168, h: 90, talkHide: true },
  { id: 'breath', name: 'Breath', group: 'vitals', sel: '.breath-tab', anchor: 'bl', x: 612, y: 147, scale: 1, visible: true, situations: FOOT, w: 186, h: 44, talkHide: true },
  { id: 'footing', name: 'Footing', group: 'vitals', sel: '.footing', anchor: 'bc', x: 0, y: 310, scale: 1, visible: true, situations: ['deck', 'prone'], w: 320, h: 30, talkHide: true },
  // ---- the gun in your hands ----
  { id: 'weapon', name: 'Weapon plate', group: 'combat', sel: '.weapon-panel', anchor: 'br', x: 10, y: 10, scale: 1, visible: true, situations: FOOT, w: 307, h: 252, talkHide: true },
  { id: 'weaponbar', name: 'Weapon bar', group: 'combat', sel: '.wbar', anchor: 'br', x: 330, y: 10, scale: 1, visible: true, situations: FOOT, w: 300, h: 90, talkHide: true },
  { id: 'reticle', name: 'Reticle', group: 'combat', sel: '.reticle', anchor: 'mouse', x: 0, y: 0, scale: 1, visible: true, situations: PLAY, w: 28, h: 28 },
  // ---- the car ----
  { id: 'speedo', name: 'Speedometer and dash', group: 'vehicle', sel: '.speedo', anchor: 'br', x: 10, y: 10, scale: 1, visible: true, situations: ['driving', 'passenger'], w: 330, h: 252, talkHide: true },
  // ---- what the game is telling you right now ----
  { id: 'prompt', name: 'Action prompt', group: 'messages', sel: '.prompt', anchor: 'bc', x: 0, y: 262, scale: 1, visible: true, situations: PLAY, w: 360, h: 40, talkHide: true },
  { id: 'subtitle', name: 'Subtitles', group: 'messages', sel: '.subtitle', anchor: 'tc', x: 0, y: 150, scale: 1, visible: true, situations: ALL, w: 700, h: 40, talkHide: true },
];

// Presets: a layout scale and per-row overrides on top of HUD_LAYOUT. A player's own edits ride on top of a preset.
export const HUD_PRESETS = {
  default: { name: 'Default', scale: 0.75, blurb: 'the standard layout, three quarters of the old size', rows: {} },
  compact: {
    name: 'Compact', scale: 0.62, blurb: 'smallest: the world first, the respect chips and role tapes tucked away',
    rows: { respect: { visible: false }, roles: { visible: false }, objective: { scale: 0.8 }, killfeed: { scale: 0.85 }, feed: { y: 230 } },
  },
  streamer: {
    name: 'Streamer', scale: 0.7, blurb: 'the top-left corner kept clear for a camera; orders and messages down the left edge; big subtitles',
    rows: { objective: { anchor: 'ml', x: 14, y: -150 }, feed: { anchor: 'ml', x: 24, y: 120 }, subtitle: { scale: 1.3 }, killfeed: { scale: 1.15 } },
  },
  controller: {
    name: 'Controller', scale: 0.85, blurb: 'couch distance: bigger plates, a bigger prompt and weapon bar',
    rows: { prompt: { scale: 1.2 }, weaponbar: { scale: 1.15 }, subtitle: { scale: 1.15 }, footing: { scale: 1.15 } },
  },
};
export const PRESET_IDS = Object.keys(HUD_PRESETS);

export const SCALE_MIN = 0.4, SCALE_MAX = 2.5, OFFSET_MAX = 4000;
export const EDIT_FIELDS = ['anchor', 'x', 'y', 'scale', 'visible', 'situations'];

// 1.0 at 1600x900, clamped so 1280x720 and 4K both read (the HUD's screen fit since 2026-10-22).
export const fitScale = (W, H) => Math.max(0.62, Math.min(1.35, Math.min(W / 1600, H / 900)));
export const layoutScale = (W, H, hudSize = 1, presetScale = 1) => fitScale(W, H) * (Number(hudSize) || 1) * presetScale;

// Where a row's box lands on a W x H screen: its natural (unscaled) size w x h, the layout scale L. Clamped onto the screen
// (a box bigger than the screen pins to the anchor's edge). Pure: the live layout and the selftest's other-sizes checks
// both use it. Returns { x, y, w, h, k } in screen px (k = the element's own scale on screen).
export function placeRect(row, W, H, w, h, L, out = {}) {
  const a = ANCHORS[row.anchor] ?? ANCHORS.tl, k = L * (row.scale ?? 1), bw = w * k, bh = h * k;
  let x = a.ax * (W - bw) + (a.ax === 1 ? -1 : 1) * (row.x ?? 0) * L;
  let y = a.ay * (H - bh) + (a.ay === 1 ? -1 : 1) * (row.y ?? 0) * L;
  x = bw >= W ? (a.ax === 1 ? W - bw : 0) : Math.max(0, Math.min(W - bw, x));
  y = bh >= H ? (a.ay === 1 ? H - bh : 0) : Math.max(0, Math.min(H - bh, y));
  out.x = x; out.y = y; out.w = bw; out.h = bh; out.k = k;
  return out;
}
// The inverse: the row offset that puts a box of screen size bw x bh at screen (x, y) under this anchor.
export function offsetFor(anchor, W, H, bw, bh, x, y, L) {
  const a = ANCHORS[anchor] ?? ANCHORS.tl, r = (v) => Math.round(v * 10) / 10;
  return { x: r((a.ax === 1 ? W - bw - x : x - a.ax * (W - bw)) / L), y: r((a.ay === 1 ? H - bh - y : y - a.ay * (H - bh)) / L) };
}

// The rows a player sees: HUD_LAYOUT, then the preset's overrides, then the player's own edits ({ id: { field: value } }).
export function resolveLayout(preset = 'default', edits = {}, base = HUD_LAYOUT) {
  const P = HUD_PRESETS[preset] ?? HUD_PRESETS.default;
  return base.map((r) => {
    const o = { ...r, ...(P.rows[r.id] ?? {}), ...(edits?.[r.id] ?? {}) };
    o.situations = [...(o.situations ?? r.situations)];
    return o;
  });
}

// The edits that turn a preset's rows into these rows (an imported rows file becomes edits on a preset).
export function diffLayout(rows, preset = 'default') {
  const ref = Object.fromEntries(resolveLayout(preset).map((r) => [r.id, r])), edits = {};
  for (const r of rows ?? []) {
    const b = ref[r.id];
    if (!b) continue;
    for (const f of EDIT_FIELDS) {
      if (r[f] === undefined) continue;
      const same = f === 'situations' ? JSON.stringify([...r[f]].sort()) === JSON.stringify([...b[f]].sort()) : r[f] === b[f];
      if (!same) (edits[r.id] ??= {})[f] = f === 'situations' ? [...r[f]] : r[f];
    }
  }
  return edits;
}

// Problems with a set of rows (empty = good). The World Forge and the selftest call it; an import is refused on any.
export function validateHudLayout(rows = HUD_LAYOUT) {
  const bad = [], seen = new Set();
  if (!Array.isArray(rows) || !rows.length) return ['rows must be a non-empty array'];
  for (const r of rows) {
    const at = `hud row ${r?.id ?? '?'}`;
    if (!r || typeof r.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(r.id)) { bad.push(`${at}: id must be lower_snake text`); continue; }
    if (seen.has(r.id)) bad.push(`${at}: duplicate id`);
    seen.add(r.id);
    if (typeof r.name !== 'string' || !r.name.trim()) bad.push(`${at}: needs a name`);
    if (typeof r.sel !== 'string' || !r.sel.trim()) bad.push(`${at}: needs a selector (sel)`);
    if (!(r.anchor in ANCHORS) && r.anchor !== 'mouse') bad.push(`${at}: anchor '${r.anchor}' is not one of ${Object.keys(ANCHORS).join(' ')} mouse`);
    if (r.anchor === 'mouse' && r.id !== 'reticle') bad.push(`${at}: only the reticle follows the mouse`);
    for (const f of ['x', 'y']) if (!Number.isFinite(r[f]) || Math.abs(r[f]) > OFFSET_MAX) bad.push(`${at}: ${f} must be a number within ±${OFFSET_MAX}`);
    if (!Number.isFinite(r.scale) || r.scale < SCALE_MIN || r.scale > SCALE_MAX) bad.push(`${at}: scale ${r.scale} outside ${SCALE_MIN}..${SCALE_MAX}`);
    if (typeof r.visible !== 'boolean') bad.push(`${at}: visible must be true or false`);
    if (!Array.isArray(r.situations)) bad.push(`${at}: situations must be a list`);
    else for (const s of r.situations) if (!(s in SITUATIONS)) bad.push(`${at}: unknown situation '${s}'`);
    for (const f of ['w', 'h']) if (r[f] !== undefined && (!Number.isFinite(r[f]) || r[f] <= 0 || r[f] > 2000)) bad.push(`${at}: ${f} must be a positive size`);
  }
  for (const [id, P] of Object.entries(HUD_PRESETS)) {
    if (!Number.isFinite(P.scale) || P.scale < 0.3 || P.scale > 2) bad.push(`preset ${id}: scale ${P.scale} outside 0.3..2`);
    for (const rid of Object.keys(P.rows)) if (!seen.has(rid) && rows === HUD_LAYOUT) bad.push(`preset ${id}: overrides unknown row ${rid}`);
  }
  return bad;
}
