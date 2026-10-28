// THE PANELS AS NAMED REGIONS (docs/design/WEB_UI_EDITOR.md §3.8). The full screens (the WORKSHOP, the PACK, the sheet,
// the crew, dialogue, the travel boards, the creator, the pause menu) are each a ROOT and a list of REGIONS. The HUD
// editor (F6) has a SCREEN picker: pick a panel and every region gets its outline and name, and you move, size, hide or
// re-anchor it inside the panel, scale just its text, and set a list's columns and row density. None of that has to
// resize the whole panel (a per-panel scale is there for when you want it). ui/panellayout.js turns a player's edits into
// one generated stylesheet keyed on these selectors, so a panel that rebuilds its rows every render keeps them.
//
// A panel: { name, root (CSS selector of the panel's card), regions: [...] }
// A region:
//   id        stable key (never rename one)
//   name      what the editor's label calls it
//   sel       CSS selector inside the root
//   list      true: a list or grid of rows, so it takes columns (`cols`, a CSS grid) and row density
//   cols      the list's columns as the panel ships it (only for list regions that are grids)
//   tab       it lives on one of the panel's tabs, so it can be off screen while another tab shows (it still exists)
// A player's edit of a region (all optional): visible, scale (0.5..2, the whole region), text (0.6..1.8, only the text
// in it), dx / dy (px nudge inside the panel), anchor (flow | tl tc tr bl bc br: lift it out of the flow and pin it to
// that corner of the panel), cols (1..4), density (0.5..1.6: the gap and padding between rows).

export const PANELS = {
  workshop: {
    name: 'Workshop', root: '.ws-card',
    regions: [
      { id: 'head', name: 'Title and scrip', sel: '.ws-head' },
      { id: 'chassis', name: 'Chassis diagram', sel: '.ws-bp' },
      { id: 'tabs', name: 'Tabs', sel: '.ws-tabs' },
      { id: 'parts', name: 'Parts grid', sel: '.ws-rack', list: true, cols: 2 },
      { id: 'detail', name: 'Detail block', sel: '.ws-detail' },
      { id: 'buttons', name: 'Fit / take off / next face / repair', sel: '.ws-acts' },
      { id: 'stats', name: 'Stats bar', sel: '.ws-stats' },
      { id: 'say', name: 'Shop talk', sel: '.ws-say' },
      { id: 'keys', name: 'Key hints', sel: '.ws-keys' },
    ],
  },
  pack: {
    name: 'Pack', root: '.invmenu > .inv-card',
    regions: [
      { id: 'head', name: 'Title and load', sel: '.inv-head' },
      { id: 'doll', name: 'Paperdoll', sel: '.inv-doll' },
      { id: 'dogs', name: 'Dogs', sel: '.inv-dogs' },
      { id: 'columns', name: 'Your things / theirs', sel: '.inv-cols', list: true, cols: 2 },
      { id: 'detail', name: 'Detail block', sel: '.inv-detail' },
      { id: 'buttons', name: 'Use / move / drop', sel: '.inv-acts' },
      { id: 'say', name: 'Trade talk', sel: '.inv-say' },
      { id: 'keys', name: 'Key hints', sel: '.inv-keys' },
    ],
  },
  sheet: {
    name: 'Character sheet', root: '.cs',
    regions: [
      { id: 'head', name: 'Name and flag', sel: '.cs-head' },
      { id: 'tabs', name: 'Tabs', sel: '.cs-tabs' },
      { id: 'body', name: 'Cards', sel: '.cs-body', list: true },
      { id: 'close', name: 'Close', sel: '.cs-x' },
    ],
  },
  crew: {
    name: 'Crew', root: '.crewp-card',
    regions: [
      { id: 'head', name: 'Title and orders', sel: '.crewp-head' },
      { id: 'cards', name: 'Crew cards', sel: '.crewp-grid', list: true },
      { id: 'foot', name: 'Footer', sel: '.crewp-foot' },
    ],
  },
  dialogue: {
    name: 'Dialogue', root: '.dlg',
    regions: [
      { id: 'portrait', name: 'Portrait and flag', sel: '.dlg-portrait' },
      { id: 'head', name: 'Name and title', sel: '.dlg-head' },
      { id: 'text', name: 'What they say', sel: '.dlg-text' },
      { id: 'choices', name: 'Your answers', sel: '.dlg-choices', list: true },
    ],
  },
  travel: {
    name: 'Travel board', root: '.tp',
    regions: [
      { id: 'title', name: 'Title', sel: '.tp-title' },
      { id: 'sub', name: 'Subtitle', sel: '.tp-sub' },
      { id: 'cash', name: 'Cash', sel: '.tp-cash' },
      { id: 'note', name: 'Note', sel: '.tp-note' },
      { id: 'table', name: 'Timetable', sel: '.tp-table', list: true },
      { id: 'foot', name: 'Key hints', sel: '.tp-foot' },
    ],
  },
  creator: {
    name: 'Creator', root: '.cr',
    regions: [
      { id: 'top', name: 'Title and steps', sel: '.cr-top' },
      { id: 'panel', name: 'Choices', sel: '.cr-panel' },
      { id: 'card', name: 'The survivor card', sel: '.cr-card' },
      { id: 'points', name: 'Points', sel: '.cr-points' },
      { id: 'foot', name: 'Buttons and hints', sel: '.cr-foot' },
    ],
  },
  pause: {
    name: 'Pause menu', root: '.pm-card',
    regions: [
      { id: 'title', name: 'Title', sel: '.pm-title' },
      { id: 'tabs', name: 'Tabs', sel: '.pm-tabs' },
      { id: 'buttons', name: 'Buttons', sel: '.pm-buttons', list: true, cols: 2 },
      { id: 'settings', name: 'Settings', sel: '.pm-settings', list: true, cols: 2, tab: 'settings' },
      { id: 'keys', name: 'Key list', sel: '.pm-keys', tab: 'controls' },
    ],
  },
};
export const PANEL_IDS = Object.keys(PANELS);

export const PANEL_ANCHORS = ['flow', 'tl', 'tc', 'tr', 'bl', 'bc', 'br'];
export const REGION_FIELDS = { visible: 'boolean', scale: [0.5, 2], text: [0.6, 1.8], dx: [-800, 800], dy: [-800, 800], anchor: 'anchor', cols: [1, 4], density: [0.5, 1.6] };
export const PANEL_SCALE = [0.6, 1.4];

// Presets: one set of edits for every panel ({ panel: { scale?, regions: { region: {...} } } }). A player's edits ride on top.
export const PANEL_PRESETS = {
  default: { name: 'Default', blurb: 'every panel as it ships', panels: {} },
  compact: { name: 'Compact', blurb: 'tighter lists, smaller text: more rows in view', panels: Object.fromEntries(PANEL_IDS.map((p) => [p, { regions: Object.fromEntries(PANELS[p].regions.filter((r) => r.list).map((r) => [r.id, { density: 0.75, text: 0.92 }])) }])) },
  large: { name: 'Large text', blurb: 'couch distance: every region\'s text 120%', panels: Object.fromEntries(PANEL_IDS.map((p) => [p, { regions: Object.fromEntries(PANELS[p].regions.map((r) => [r.id, { text: 1.2 }])) }])) },
};
export const PANEL_PRESET_IDS = Object.keys(PANEL_PRESETS);

// The edits of one panel under a preset plus the player's own: { scale, regions: { id: {...} } }.
export function resolvePanel(panel, preset = 'default', edits = {}) {
  const P = PANEL_PRESETS[preset]?.panels?.[panel] ?? {}, E = edits?.[panel] ?? {}, out = { scale: E.scale ?? P.scale ?? 1, regions: {} };
  for (const r of PANELS[panel]?.regions ?? []) out.regions[r.id] = { ...(P.regions?.[r.id] ?? {}), ...(E.regions?.[r.id] ?? {}) };
  return out;
}

// Problems with a panel layout's edits (empty = good). An import is refused on any.
export function validatePanelLayout(edits = {}, preset = 'default') {
  const bad = [];
  if (!PANEL_PRESETS[preset]) bad.push(`unknown panel preset '${preset}'`);
  if (!edits || typeof edits !== 'object') return [...bad, 'edits must be an object'];
  for (const [pid, pe] of Object.entries(edits)) {
    const P = PANELS[pid];
    if (!P) { bad.push(`unknown panel '${pid}' (${PANEL_IDS.join(' ')})`); continue; }
    if (pe.scale !== undefined && !(Number.isFinite(pe.scale) && pe.scale >= PANEL_SCALE[0] && pe.scale <= PANEL_SCALE[1])) bad.push(`${pid}: panel scale ${pe.scale} outside ${PANEL_SCALE.join('..')}`);
    for (const [rid, re] of Object.entries(pe.regions ?? {})) {
      const R = P.regions.find((r) => r.id === rid);
      if (!R) { bad.push(`${pid}: unknown region '${rid}'`); continue; }
      for (const [f, v] of Object.entries(re ?? {})) {
        const spec = REGION_FIELDS[f];
        if (!spec) bad.push(`${pid}.${rid}: unknown field '${f}'`);
        else if (spec === 'boolean' ? typeof v !== 'boolean' : spec === 'anchor' ? !PANEL_ANCHORS.includes(v) : !(Number.isFinite(v) && v >= spec[0] && v <= spec[1])) bad.push(`${pid}.${rid}: ${f}=${JSON.stringify(v)} is not allowed`);
        if ((f === 'cols' || f === 'density') && !R.list) bad.push(`${pid}.${rid}: ${f} only applies to a list region`);
      }
    }
  }
  return bad;
}
export function validatePanels() {
  const bad = [];
  for (const [pid, P] of Object.entries(PANELS)) {
    if (!P.name || !P.root) bad.push(`${pid}: needs a name and a root`);
    const ids = new Set();
    for (const r of P.regions) {
      if (!/^[a-z][a-z0-9_]*$/.test(r.id) || ids.has(r.id)) bad.push(`${pid}.${r.id}: id missing, malformed or repeated`);
      ids.add(r.id);
      if (!r.name || !r.sel) bad.push(`${pid}.${r.id}: needs a name and a selector`);
    }
  }
  for (const [id, pr] of Object.entries(PANEL_PRESETS)) bad.push(...validatePanelLayout(pr.panels, 'default').map((b) => `preset ${id}: ${b}`));
  return bad;
}
