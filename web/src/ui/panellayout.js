import { PANELS, PANEL_IDS, PANEL_PRESETS, PANEL_ANCHORS, REGION_FIELDS, PANEL_SCALE, resolvePanel, validatePanelLayout } from '../data/panellayout.js';

// THE PANELS, live (docs/design/WEB_UI_EDITOR.md §3.8; rows data/panellayout.js). A player's panel layout becomes ONE
// generated <style> keyed on each panel's root and region selectors (never inline styles), so a panel that rebuilds its
// rows on every render keeps the layout. Rebuilt only when the layout changes. Also: how to open and close each panel for
// the editor, the selftest and the sheet (some need a car or someone to talk to, and stage one), and the text-overlap
// audit the selftest and tools/panel-sheet.mjs both run.

const STORE = 'dsoa.panellayout';
const r2 = (v) => Math.round(v * 1000) / 1000;

export class PanelLayout {
  constructor(game) {
    this.g = game;
    this.state = { preset: 'default', edits: {} };
    this.load();
    this.style = typeof document !== 'undefined' ? document.createElement('style') : null;
    if (this.style) { this.style.id = 'panel-layout'; document.head.appendChild(this.style); }
    this.apply();
  }
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (s && PANEL_PRESETS[s.preset] && s.edits && !validatePanelLayout(s.edits, s.preset).length) this.state = { preset: s.preset, edits: s.edits };
    } catch { /* blocked storage or a bad save: the panels as they ship */ }
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.state)); } catch { /* lasts this session */ } }
  snapshot() { return JSON.stringify(this.state); }
  setState(st) { this.state = { preset: st.preset, edits: JSON.parse(JSON.stringify(st.edits ?? {})) }; this.apply(); this.save(); }
  get preset() { return this.state.preset; }
  resolved(panel) { return resolvePanel(panel, this.state.preset, this.state.edits); }

  // ---- the stylesheet ------------------------------------------------------------------------------------------------
  css() {
    const out = [];
    for (const pid of PANEL_IDS) {
      const P = PANELS[pid], L = this.resolved(pid), root = P.root;
      if (L.scale !== 1) out.push(`${root} { zoom: ${r2(L.scale)} !important; }`);
      let anchored = false;
      for (const reg of P.regions) {
        const e = L.regions[reg.id], R = `${root} ${reg.sel}`, d = [];
        if (!e || !Object.keys(e).length) continue;
        if (e.visible === false) { out.push(`${R} { display: none !important; }`); continue; }
        const s = e.scale ?? 1, t = e.text ?? 1, dx = e.dx ?? 0, dy = e.dy ?? 0, a = e.anchor ?? 'flow';
        if (s !== 1) d.push(`zoom: ${r2(s)} !important`);
        if (a !== 'flow') {
          anchored = true;
          d.push('position: absolute !important', 'z-index: 3', 'margin: 0 !important');
          d.push(a[0] === 't' ? 'top: 10px !important; bottom: auto !important' : 'bottom: 10px !important; top: auto !important');
          d.push(a[1] === 'l' ? 'left: 10px !important; right: auto !important' : a[1] === 'r' ? 'right: 10px !important; left: auto !important' : 'left: 50% !important; right: auto !important');
        }
        if (dx || dy || a[1] === 'c') d.push(`translate: ${a[1] === 'c' ? `calc(-50% + ${dx}px)` : `${dx}px`} ${dy}px !important`);
        if (reg.list && e.cols) d.push(`display: grid !important; grid-template-columns: repeat(${e.cols}, minmax(0, 1fr)) !important`);
        if (reg.list && e.density && e.density !== 1) d.push(`row-gap: ${Math.round(6 * e.density)}px !important`);
        if (d.length) out.push(`${R} { ${d.join('; ')}; }`);
        if (reg.list && e.density && e.density !== 1) out.push(`${R} > * { padding-top: ${Math.round(4 * e.density)}px !important; padding-bottom: ${Math.round(4 * e.density)}px !important; min-height: 0 !important; }`);
        // text only: the leaves (an element with no element inside it) zoom; the region itself if it is one
        if (t !== 1) out.push(`${R} :not(:has(*)):not(canvas):not(img):not(svg):not(svg *) { zoom: ${r2(t)} !important; }`, `${R}:not(:has(*)) { zoom: ${r2(t * s)} !important; }`);
      }
      if (anchored) out.push(`${root} { position: relative; }`);
    }
    return out.join('\n');
  }
  apply() { const c = this.css(); if (this.style && c !== this.cssNow) { this.style.textContent = c; this.cssNow = c; } }

  // ---- editing --------------------------------------------------------------------------------------------------------
  // One region's fields (see REGION_FIELDS), or the panel's scale with region=null. Returns the problems (empty: done).
  edit(panel, region, fields, { save = true } = {}) {
    if (!PANELS[panel]) return [`no panel '${panel}' (${PANEL_IDS.join(' ')})`];
    const edits = JSON.parse(JSON.stringify(this.state.edits)), pe = (edits[panel] ??= {});
    if (region === null || region === undefined) { if (fields.scale !== undefined) pe.scale = r2(Math.max(PANEL_SCALE[0], Math.min(PANEL_SCALE[1], Number(fields.scale)))); }
    else {
      const R = PANELS[panel].regions.find((r) => r.id === region);
      if (!R) return [`no region '${region}' in ${panel} (${PANELS[panel].regions.map((r) => r.id).join(' ')})`];
      const e = ((pe.regions ??= {})[region] ??= {});
      for (const [f, v] of Object.entries(fields)) {
        if (v === undefined) continue;
        const spec = REGION_FIELDS[f];
        if (!spec) return [`unknown field '${f}' (${Object.keys(REGION_FIELDS).join(' ')})`];
        e[f] = Array.isArray(spec) ? Math.round(Math.max(spec[0], Math.min(spec[1], Number(v))) * 100) / 100 : v;
        if (f === 'cols') e[f] = Math.round(e[f]);
      }
    }
    const bad = validatePanelLayout(edits, this.state.preset);
    if (bad.length) return bad;
    this.state.edits = edits;
    this.apply();
    if (save) this.save();
    return [];
  }
  setPreset(id) { if (!PANEL_PRESETS[id]) return [`no panel preset '${id}' (${Object.keys(PANEL_PRESETS).join(' ')})`]; this.state = { preset: id, edits: {} }; this.apply(); this.save(); return []; }
  reset(panel = null, region = null) {
    const e = JSON.parse(JSON.stringify(this.state.edits));
    if (!panel) this.state.edits = {};
    else if (!region) delete e[panel];
    else delete e[panel]?.regions?.[region];
    if (panel) this.state.edits = e;
    this.apply(); this.save();
    return [];
  }
  exportLayout() { return { version: 1, kind: 'panels', preset: this.state.preset, edits: JSON.parse(JSON.stringify(this.state.edits)) }; }
  importLayout(src) {
    let o = src;
    if (typeof src === 'string') { try { o = JSON.parse(src); } catch (e) { return [`not JSON: ${e.message}`]; } }
    if (!o || typeof o !== 'object') return ['a panel layout is { preset, edits }'];
    const preset = o.preset ?? 'default', edits = o.edits ?? {};
    const bad = validatePanelLayout(edits, preset);
    if (bad.length) return bad;
    this.state = { preset, edits: JSON.parse(JSON.stringify(edits)) };
    this.apply(); this.save();
    return [];
  }

  // ---- opening panels (the editor's SCREEN picker, the checks, the sheet) -------------------------------------------
  isOpen(pid) {
    const g = this.g;
    return { workshop: () => g.workshopUI?.open, pack: () => g.invUI?.open, sheet: () => g.charSheet?.open, crew: () => g.crewUI?.open, dialogue: () => !!g.dialogue?.active,
      travel: () => g.travel?.ui?.open, table: () => !!g.tablePanel?.open, creator: () => !!document.querySelector('.cr:not(.hidden)'), pause: () => g.qol?.menuOpen }[pid]?.() ?? false;
  }
  open(pid, opts = {}) {
    const g = this.g, p = g.player;
    if (!PANELS[pid]) return { ok: false, why: `no panel '${pid}'` };
    if (this.isOpen(pid)) return { ok: true };
    try {
      switch (pid) {
        case 'workshop': {
          if (p.inVehicle) g.exitVehicle?.(true);
          if (!g.workshop.carFor()) g.lastVehicle = g.vehiclesSys.spawn('pickup', p.x + 7, p.z, 0, '#5a3a24', {}); // a preview needs a car beside you
          const r = g.workshopUI.toggle(true, true);
          if (!r?.ok) return r ?? { ok: false };
          if (opts.tab !== undefined) { g.workshopUI.tab = opts.tab; g.workshopUI.sel = 0; g.workshopUI.render(); }
          break;
        }
        case 'pack': g.invUI.toggle(true); break;
        case 'sheet': g.charSheet.toggle(true); break;
        case 'crew': g.crewUI.toggle(true); break;
        case 'dialogue': {
          let best = null, bd = Infinity;
          for (const c of g.chars) if (c.alive && c.npc && c !== p) { const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } }
          if (!best) return { ok: false, why: 'nobody to talk to' };
          g.dialogue.open(best);
          break;
        }
        case 'travel': g.travel.ui.show(SAMPLE_BOARD); break;
        case 'table': g.tablePanel.preview(); break; // a sample hand (ui/tablepanel.js), no seat taken
        case 'creator': g.creatorUI.open({}); break;
        case 'pause': g.qol.toggleMenu(true); break;
        default:
      }
    } catch (e) { return { ok: false, why: String(e.message ?? e) }; }
    return { ok: this.isOpen(pid) || !!document.querySelector(PANELS[pid].root) };
  }
  close(pid) {
    const g = this.g;
    try {
      ({ workshop: () => g.workshopUI.toggle(false), pack: () => g.invUI.toggle(false), sheet: () => g.charSheet.toggle(false), crew: () => g.crewUI.toggle(false),
        dialogue: () => g.dialogue.close(), travel: () => g.travel.ui.close(), table: () => g.tablePanel.close(), creator: () => g.creatorUI.close(false), pause: () => g.qol.toggleMenu(false) })[pid]?.();
    } catch { /* already shut */ }
  }
  // A panel with tabs shows the one a region lives on (the editor's TAB buttons).
  showTab(pid, tab) { if (pid === 'pause') this.g.qol?.showTab?.(tab); }
  rootEl(pid) { const els = [...document.querySelectorAll(PANELS[pid]?.root ?? '#none')]; return els.find((e) => e.getClientRects().length) ?? els[0] ?? null; }
  regionEls(pid) {
    const root = this.rootEl(pid);
    return PANELS[pid].regions.map((r) => ({ ...r, el: root?.querySelector(r.sel) ?? null }));
  }
  list(pid) {
    const L = this.resolved(pid);
    return this.regionEls(pid).map((r) => {
      const b = r.el?.getBoundingClientRect();
      return { id: r.id, name: r.name, sel: r.sel, list: !!r.list, live: !!r.el, edit: L.regions[r.id], rect: b ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) } : null };
    });
  }
}

// A sample departures board for the travel panel's preview (the real ones come from systems/travel.js at a pole or station).
const SAMPLE_BOARD = {
  kind: 'TRUNDLE', title: 'PHOENIX JUNCTION', sub: 'the iron to Tucson and the coast', note: 'Punch your ticket at the window. The trundle waits for nobody.',
  rows: [{ key: '1', cols: ['TUCSON', '06:40', '$12'] }, { key: '2', cols: ['YUMA', '09:15', '$20'] }, { key: '3', cols: ['EL PASO', '13:30', '$34'], dim: true }],
  foot: [['1-3', 'buy'], ['ESC', 'close']], onKey: (code) => (code === 'Escape' ? 'close' : false),
};

// Every pair of visible text runs inside `root` whose boxes cross (after clipping each to its scrolling/hidden ancestors).
// A text run is one text node; two runs in the same element never count. Returns [{ a, b, area }] (the 12 worst).
export function textOverlaps(root, minArea = 6) {
  if (!root) return [];
  const runs = [], clipOf = new Map(), rg = document.createRange();
  const clip = (el) => {
    if (clipOf.has(el)) return clipOf.get(el);
    let box = null;
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) { box = { x: 0, y: 0, w: 0, h: 0 }; break; }
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
        const b = e.getBoundingClientRect(), c = { x: b.x, y: b.y, w: b.width, h: b.height };
        box = box ? inter(box, c) : c;
      }
    }
    clipOf.set(el, box);
    return box;
  };
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    rg.selectNodeContents(n);
    const c = clip(el);
    for (const b of rg.getClientRects()) { // one box per line: a wrapped run is never its whole bounding box
      let r = { x: b.x, y: b.y, w: b.width, h: b.height };
      if (c) r = inter(r, c);
      if (r.w < 1 || r.h < 1) continue;
      runs.push({ el, r, t: n.nodeValue.trim().slice(0, 24) });
    }
  }
  const hits = [];
  for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
    const A = runs[i], B = runs[j];
    if (A.el === B.el) continue;
    const o = inter(A.r, B.r), area = o.w * o.h;
    if (o.w > 1.5 && o.h > 3 && area >= minArea) hits.push({ a: A.t, b: B.t, area: Math.round(area) });
  }
  return hits.sort((x, y) => y.area - x.area).slice(0, 12);
}
function inter(a, b) { const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y); return { x, y, w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x), h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y) }; }
export const rectsCross = (a, b) => { const o = inter(a, b); return o.w > 1 && o.h > 1; };
export { PANEL_ANCHORS };
