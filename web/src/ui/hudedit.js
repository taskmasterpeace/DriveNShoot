import './hudedit.css';
import { PanelEditMode } from './paneledit.js';
import { PANELS, PANEL_IDS } from '../data/panellayout.js';
import { HUD_PRESETS, PRESET_IDS, SITUATIONS, SITUATION_IDS, ANCHORS, placeRect, offsetFor, resolveLayout, diffLayout, validateHudLayout, layoutScale, SCALE_MIN, SCALE_MAX, EDIT_FIELDS } from '../data/hudlayout.js';

// THE HUD LAYOUT, live (docs/design/WEB_UI_EDITOR.md). Every HUD element named in data/hudlayout.js is lifted into its own
// wrapper (.hl) under the HUD and placed from its row: anchored to a corner or edge, offset in design px times the layout
// scale, clamped onto the screen. A ResizeObserver re-places an element only when its own size changes (a respect chip
// joins, the kill feed grows); the window's resize re-places all; nothing runs per frame. The situation (on foot,
// driving, a deck, dead...) is read at 4 Hz from the HUD's slow lane and hides what that situation doesn't show.
//
// THE HUD EDITOR (F6, or EDIT HUD in the pause menu): the game pauses, every element gets its outline and its name; drag
// to move (snaps to the screen's edges and centre and to its neighbours, Shift to skip), the corner grip, the slider or
// the wheel to size, the 3x3 grid to change the corner it hangs from (it stays put on screen), hide, reset one or all,
// undo/redo, a SITUATION strip that previews each situation's HUD, the four presets, EXPORT / IMPORT as JSON. A player's
// layout lives in localStorage ('dsoa.hudlayout'); an export is rows in data/hudlayout.js's own shape.

const STORE = 'dsoa.hudlayout';
const SAMPLE = { prompt: '<kbd>E</kbd> OPEN TRUNK', subtitle: 'Subtitles: what people say out loud.', footing: '<b>FOOTING · STEADY</b> STAND ×1.00 · <kbd>CTRL</kbd> brace' };

// What the player is doing, for the HUD: first match wins (data/hudlayout.js SITUATIONS).
export function situationOf(g) {
  const p = g.player;
  if (!p) return 'on_foot';
  if (!p.alive) return 'dead';
  if (g.qol?.menuOpen || g.qol?.mapOpen) return 'menu';
  if (g.workshopUI?.open || g.invUI?.open || g.charSheet?.open || g.crewUI?.open || g.travel?.ui?.open) return 'panel';
  const v = p.inVehicle;
  if (v) return v.driver === p ? 'driving' : 'passenger';
  if (p.onDeck) return 'deck';
  if (p.prone) return 'prone';
  if (g.sky?.phase === 'NIGHT') return 'night';
  return 'on_foot';
}

export class HudLayout {
  constructor(hud) {
    this.hud = hud; this.g = hud.g; this.root = hud.root; this.host = hud.el.hud;
    this.state = { preset: 'default', edits: {} };
    this.load();
    this.byId = {};
    this.boxes = [];
    this.sit = null; this.forced = null; this.editing = false; this.dirty = true;
    this.L = 1; this.W = 1600; this.H = 900;
    this.tmp = {};
    this.unhid = []; this.sampled = [];
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((list) => {
      for (const e of list) {
        const b = e.target.__hl;
        if (!b || e.contentRect.width < 1) continue; // hidden (display: none): keep the last real size so it lands where it was
        b.w = e.contentRect.width; b.h = e.contentRect.height;
        this.place(b);
      }
    }) : null;
    this.rebuild();
    this.bind();
  }

  // ---- the player's layout ------------------------------------------------------------------------------------------
  load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
      if (s && HUD_PRESETS[s.preset] && s.edits && typeof s.edits === 'object' && !validateHudLayout(resolveLayout(s.preset, s.edits)).length) this.state = { preset: s.preset, edits: s.edits };
    } catch { /* private window or a bad save: the default stands */ }
  }
  save() { try { localStorage.setItem(STORE, JSON.stringify(this.state)); } catch { /* storage blocked: the layout lasts this session */ } }
  get preset() { return this.state.preset; }
  get presetScale() { return (HUD_PRESETS[this.state.preset] ?? HUD_PRESETS.default).scale; }

  rebuild() {
    this.rows = resolveLayout(this.state.preset, this.state.edits);
    for (const row of this.rows) {
      const b = (this.byId[row.id] ??= { id: row.id, row, el: null, wrap: null, w: row.w ?? 100, h: row.h ?? 40, x: NaN, y: NaN, k: NaN, sw: 0, sh: 0, shown: null });
      b.row = row;
      if (!this.boxes.includes(b)) this.boxes.push(b);
      if (b.wrap) this.dress(b);
    }
    this.dirty = true;
  }
  dress(b) {
    const a = ANCHORS[b.row.anchor] ?? ANCHORS.tl, w = b.wrap;
    w.dataset.ax = a.ax; w.dataset.ay = a.ay; w.dataset.group = b.row.group;
    w.classList.toggle('talk-hide', !!b.row.talkHide);
    w.style.minWidth = `${b.row.w ?? 0}px`; w.style.minHeight = `${b.row.h ?? 0}px`;
    w.firstChild.textContent = b.row.name; w.title = b.row.tip ?? ''; // plain words and what it shows: the editor never prints an internal name
  }

  // Lift each element into its wrapper. Elements other modules build later (the compass, the weapon bar, the telltale
  // rail) bind on a later tick.
  bind() {
    let un = 0;
    for (const b of this.boxes) {
      if (b.el) continue;
      const el = this.root.querySelector(b.row.sel);
      if (!el) { un++; continue; }
      b.el = el;
      if (b.row.anchor === 'mouse') { this.place(b); continue; }
      const w = document.createElement('div');
      w.className = 'hl';
      w.dataset.hud = b.id;
      w.innerHTML = '<span class="hl-name"></span><i class="hl-grip"></i>';
      w.__hl = b;
      b.wrap = w;
      this.host.insertBefore(w, this.hud.el.vignette ?? null); // under the vignette, the hurt flash and the dead screen, as before
      w.appendChild(el);
      this.dress(b);
      this.ro?.observe(w);
      b.x = NaN;
      this.place(b);
    }
    this.unbound = un;
    this.dirty = true;
  }

  // ---- placing ------------------------------------------------------------------------------------------------------
  apply() {
    this.W = innerWidth; this.H = innerHeight;
    this.L = layoutScale(this.W, this.H, this.g.qol?.settings?.hudScale, this.presetScale);
    for (const b of this.boxes) { b.x = NaN; this.place(b); }
    this.situate();
  }
  place(b) {
    if (!b.el) return;
    if (!b.wrap) { const k = (b.row.scale ?? 1).toFixed(3); if (k !== b.rk) { b.rk = k; b.el.style.setProperty('--rk', k); } return; } // the reticle keeps its size; only its own scale
    const r = placeRect(b.row, this.W, this.H, b.w, b.h, this.L, this.tmp);
    b.sw = r.w; b.sh = r.h;
    if (Math.abs(r.x - b.x) < 0.25 && Math.abs(r.y - b.y) < 0.25 && Math.abs(r.k - b.k) < 1e-4) return;
    b.x = r.x; b.y = r.y; b.k = r.k;
    b.wrap.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px) scale(${r.k.toFixed(4)})`;
    b.wrap.style.setProperty('--k', r.k.toFixed(4));
  }

  // 4 Hz from the HUD's slow lane.
  tick() {
    if (this.unbound) { this.bind(); if (!this.unbound) this.apply(); }
    this.situate();
  }
  refresh() { this.dirty = true; this.situate(); }
  situate() {
    const s = this.forced ?? situationOf(this.g);
    if (s === this.sit && !this.dirty) return;
    this.sit = s; this.dirty = false;
    for (const b of this.boxes) {
      const inSit = b.row.situations.includes(s), shown = inSit && (b.row.visible || this.editing);
      const node = b.wrap ?? b.el;
      if (!node) continue;
      if (b.shown !== shown) { b.shown = shown; node.classList.toggle('hl-off', !shown); }
      if (b.wrap) b.wrap.classList.toggle('hl-ghost', this.editing && !b.row.visible);
    }
    if (this.editing) this.preview(true);
  }
  force(s) { this.forced = s && s in SITUATIONS ? s : null; this.refresh(); }
  isShown(id) { const b = this.byId[id]; return !!b?.shown && b.row.visible; }

  // While editing, the elements the game has hidden for now (the dash on foot, the prompt with nothing to do) show with
  // what they last said, or a sample line, so every slot can be seen and placed. Put back exactly on leaving.
  preview(on) {
    for (const [el, cls] of this.unhid) el.classList.add(cls);
    for (const [el, html] of this.sampled) el.innerHTML = html;
    this.unhid.length = 0; this.sampled.length = 0;
    if (!on) return;
    for (const b of this.boxes) {
      if (!b.shown || !b.wrap) continue;
      for (const cls of ['hidden', 'empty']) if (b.el.classList.contains(cls)) { b.el.classList.remove(cls); this.unhid.push([b.el, cls]); }
      if (SAMPLE[b.id] && !b.el.textContent.trim()) { this.sampled.push([b.el, b.el.innerHTML]); b.el.innerHTML = SAMPLE[b.id]; }
    }
  }

  // ---- editing ------------------------------------------------------------------------------------------------------
  // Change one row's fields (anchor, x, y, scale, visible, situations). Returns the problems (empty: done).
  edit(id, fields, { save = true } = {}) {
    if (!this.byId[id]) return [`no HUD element '${id}' (${this.rows.map((r) => r.id).join(', ')})`];
    const e = { ...(this.state.edits[id] ?? {}) };
    for (const f of EDIT_FIELDS) if (fields[f] !== undefined) e[f] = f === 'situations' ? [...fields[f]] : fields[f];
    if (e.scale !== undefined) e.scale = Math.round(Math.max(SCALE_MIN, Math.min(SCALE_MAX, Number(e.scale))) * 100) / 100;
    const edits = { ...this.state.edits, [id]: e };
    const bad = validateHudLayout(resolveLayout(this.state.preset, edits));
    if (bad.length) return bad;
    this.state.edits = diffLayout(resolveLayout(this.state.preset, edits), this.state.preset); // keep only what differs from the preset
    this.rebuild();
    const b = this.byId[id]; b.x = NaN;
    if (fields.scale !== undefined || fields.anchor !== undefined) this.apply(); else { this.place(b); this.situate(); }
    if (save) this.save();
    return [];
  }
  setPreset(id) {
    if (!HUD_PRESETS[id]) return [`no preset '${id}' (${PRESET_IDS.join(', ')})`];
    this.state = { preset: id, edits: {} };
    this.rebuild(); this.apply(); this.save();
    return [];
  }
  reset(id = null) {
    if (id) { if (!this.byId[id]) return [`no HUD element '${id}'`]; const e = { ...this.state.edits }; delete e[id]; this.state.edits = e; }
    else this.state.edits = {};
    this.rebuild(); this.apply(); this.save();
    return [];
  }
  setState(st) { this.state = { preset: st.preset, edits: JSON.parse(JSON.stringify(st.edits ?? {})) }; this.rebuild(); this.apply(); this.save(); }
  snapshot() { return JSON.stringify(this.state); }

  // Rows in data/hudlayout.js's shape (paste them over HUD_LAYOUT to make them the standard), plus preset + edits.
  exportLayout() {
    return { version: 1, preset: this.state.preset, edits: JSON.parse(JSON.stringify(this.state.edits)), rows: this.rows.map((r) => ({ ...r, situations: [...r.situations] })) };
  }
  importLayout(src) {
    let o = src;
    if (typeof src === 'string') { try { o = JSON.parse(src); } catch (e) { return [`not JSON: ${e.message}`]; } }
    if (!o || typeof o !== 'object') return ['an import is { preset, edits } or { rows }'];
    const preset = HUD_PRESETS[o.preset] ? o.preset : 'default';
    let edits;
    if (Array.isArray(o.rows)) {
      const known = new Set(this.rows.map((r) => r.id)), unknown = o.rows.filter((r) => !known.has(r?.id)).map((r) => r?.id);
      if (unknown.length) return [`rows this game has no element for: ${unknown.join(', ')}`];
      const merged = resolveLayout(preset).map((r) => ({ ...r, ...(o.rows.find((q) => q.id === r.id) ?? {}) }));
      const bad = validateHudLayout(merged);
      if (bad.length) return bad;
      edits = diffLayout(merged, preset);
    } else edits = o.edits && typeof o.edits === 'object' ? o.edits : {};
    const bad = validateHudLayout(resolveLayout(preset, edits));
    if (bad.length) return bad;
    this.state = { preset, edits };
    this.rebuild(); this.apply(); this.save();
    return [];
  }

  // For agents and the selftest: each row with where it sits on screen right now.
  list() {
    return this.rows.map((r) => {
      const b = this.byId[r.id];
      return { id: r.id, name: r.name, group: r.group, anchor: r.anchor, x: r.x, y: r.y, scale: r.scale, visible: r.visible, situations: r.situations, bound: !!b.el, shown: !!b.shown && r.visible,
        rect: b.wrap ? { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.sw), h: Math.round(b.sh) } : null, size: { w: Math.round(b.w), h: Math.round(b.h) } };
    });
  }
}

// ---- the editor -------------------------------------------------------------------------------------------------------
const ANCHOR_ORDER = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const SNAP = 8;

export class HudEditor {
  constructor(hud) {
    this.hud = hud; this.g = hud.g; this.lay = hud.layout;
    this.open = false; this.selId = null; this.undoS = []; this.redoS = []; this.drag = null; this.wheelT = 0;
    this.scr = 'hud';
    // On the body, above every panel (the sheet and the creator live outside #ui), so the editor works on top of them.
    document.body.insertAdjacentHTML('beforeend', `
      <div class="hle hidden">
        <div class="hle-back"></div>
        <div class="hle-guide hle-gx hidden"></div><div class="hle-guide hle-gy hidden"></div>
        <div class="hle-panel">
          <div class="hle-head"><b>HUD LAYOUT</b><span>Drag to move · corner or wheel to size · <kbd>SHIFT</kbd> no snap · arrows nudge · <kbd>H</kbd> hide · <kbd>ESC</kbd> done</span><button class="hle-min" data-a="min" title="Fold the card to its title bar">▾</button><button class="hle-x" data-a="close" title="Done (Esc)">✕</button></div>
          <div class="hle-row"><span class="hle-k">SCREEN</span><div class="hle-pills" data-g="screen"><button data-v="hud">HUD</button>${PANEL_IDS.map((id) => `<button data-v="${id}">${PANELS[id].name}</button>`).join('')}</div></div>
          <div class="hle-row hle-hudonly"><span class="hle-k">PRESET</span><div class="hle-pills" data-g="preset">${PRESET_IDS.map((id) => `<button data-v="${id}" title="${HUD_PRESETS[id].blurb}">${HUD_PRESETS[id].name}</button>`).join('')}</div></div>
          <div class="hle-row hle-panonly"><span class="hle-k">PRESET</span><div class="hle-pills" data-g="ppreset"></div></div>
          <div class="hle-row hle-hudonly"><span class="hle-k">SITUATION</span><div class="hle-pills" data-g="sit"><button data-v="auto" title="what you're doing right now">Live</button>${SITUATION_IDS.map((id) => `<button data-v="${id}" title="${SITUATIONS[id].blurb}">${SITUATIONS[id].name}</button>`).join('')}</div></div>
          <div class="hle-row hle-hudonly"><span class="hle-k">ELEMENT</span><select class="hle-pick"></select></div>
          <div class="hle-pe hle-panonly"></div>
          <div class="hle-el hle-hudonly">
            <div class="hle-tip"><b class="hle-tname"></b><span class="hle-ttext"></span></div>
            <div class="hle-anchor" title="The corner or edge it hangs from: it stays there whatever the window's size">${ANCHOR_ORDER.map((a) => `<button data-anchor="${a}" title="${ANCHORS[a].name}"></button>`).join('')}</div>
            <div class="hle-fields">
              <label>SIZE <input type="range" class="hle-size" min="${SCALE_MIN}" max="${SCALE_MAX}" step="0.05"><b class="hle-sv"></b></label>
              <label><input type="checkbox" class="hle-vis"> Visible</label>
              <label><input type="checkbox" class="hle-insit"> Show when <span class="hle-sitname"></span></label>
              <button data-a="resetone">RESET ELEMENT</button>
            </div>
          </div>
          <div class="hle-foot"><button data-a="undo">UNDO</button><button data-a="redo">REDO</button><button data-a="resetall">RESET ALL</button><button data-a="export">EXPORT</button><button data-a="import">IMPORT</button><button data-a="close" class="hle-done">DONE</button></div>
        </div>
        <div class="hle-modal hidden"><div class="hle-mcard"><h3></h3><p></p><textarea spellcheck="false"></textarea><div class="hle-msay"></div><div class="hle-mbtns"><button data-m="copy">COPY</button><button data-m="apply">APPLY</button><button data-m="close">CLOSE</button></div></div></div>
      </div>`);
    const q = (s) => document.querySelector(s);
    this.el = { root: q('.hle'), panel: q('.hle-panel'), pick: q('.hle-pick'), size: q('.hle-size'), sv: q('.hle-sv'), vis: q('.hle-vis'), insit: q('.hle-insit'), sitname: q('.hle-sitname'), tname: q('.hle-tname'), ttext: q('.hle-ttext'),
      gx: q('.hle-gx'), gy: q('.hle-gy'), modal: q('.hle-modal'), mTitle: q('.hle-mcard h3'), mText: q('.hle-mcard p'), mArea: q('.hle-mcard textarea'), mSay: q('.hle-msay'), elBox: q('.hle-el') };
    this.el.root.addEventListener('click', (e) => this.click(e));
    this.el.pick.addEventListener('change', () => this.select(this.el.pick.value));
    this.el.size.addEventListener('input', () => { if (this.selId) this.change(this.selId, { scale: Number(this.el.size.value) }, 'size'); });
    this.el.vis.addEventListener('change', () => { if (this.selId) this.change(this.selId, { visible: this.el.vis.checked }); });
    this.el.insit.addEventListener('change', () => this.toggleSituation());
    const host = this.lay.host;
    host.addEventListener('pointerdown', (e) => this.down(e));
    host.addEventListener('pointermove', (e) => this.move(e));
    host.addEventListener('pointerup', (e) => this.up(e));
    host.addEventListener('pointercancel', (e) => this.up(e));
    host.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
    this.el.root.querySelector('.hle-head').addEventListener('pointerdown', (e) => this.dragCard(e));
    addEventListener('pointerdown', (e) => { if (this.open && this.scr === 'hud' && !e.target.closest?.('.hl, .hle-panel, .hle-modal')) this.select(null); }, true);
    addEventListener('keydown', (e) => this.key(e), true);
    this.pe = new PanelEditMode(this);
  }

  // ---- open / close -------------------------------------------------------------------------------------------------
  toggle(on = !this.open) { if (on) this.show(); else this.hide(); return this.open; }
  show() {
    if (this.open || document.querySelector('.title')) return;
    const Q = this.g.qol;
    if (Q?.menuOpen) Q.toggleMenu(false);
    if (Q?.mapOpen) Q.toggleMap(false);
    this.open = true;
    this.g.paused = true;
    this.hud.root.classList.add('hud-edit');
    this.el.root.classList.remove('hidden');
    this.lay.editing = true;
    this.lay.force(this.lay.sit ?? 'on_foot');
    this.forcedByMe = true;
    this.liveSit = null;
    this.scr = 'hud';
    this.render();
  }
  hide() {
    if (!this.open) return;
    this.open = false;
    this.drag = null;
    this.pe.leave(true);
    this.scr = 'hud';
    this.lay.editing = false;
    this.lay.preview(false);
    this.lay.force(null);
    this.el.modal.classList.add('hidden');
    this.el.root.classList.add('hidden');
    this.hud.root.classList.remove('hud-edit');
    this.guides(null, null);
    this.select(null, false);
    const Q = this.g.qol;
    this.g.paused = !!(Q?.menuOpen || Q?.mapOpen);
  }

  // ---- the panel ----------------------------------------------------------------------------------------------------
  render() {
    const L = this.lay, el = this.el;
    el.root.classList.toggle('panel-mode', this.scr !== 'hud');
    for (const b of el.root.querySelectorAll('[data-g="screen"] button')) b.classList.toggle('on', b.dataset.v === this.scr);
    el.root.querySelector('[data-a="undo"]').disabled = !this.undoS.length;
    el.root.querySelector('[data-a="redo"]').disabled = !this.redoS.length;
    if (this.scr !== 'hud') { this.pe.render(); return; }
    for (const b of el.root.querySelectorAll('[data-g="preset"] button')) b.classList.toggle('on', b.dataset.v === L.preset);
    const sit = L.forced ?? 'auto';
    for (const b of el.root.querySelectorAll('[data-g="sit"] button')) b.classList.toggle('on', b.dataset.v === sit);
    el.pick.innerHTML = `<option value="">— pick or click one —</option>${L.rows.map((r) => `<option value="${r.id}" title="${r.tip ?? ''}"${r.id === this.selId ? ' selected' : ''}>${r.name}${r.visible ? '' : ' (hidden)'}${r.situations.includes(L.sit) ? '' : ' · not here'}</option>`).join('')}`;
    const row = this.selId && L.byId[this.selId]?.row;
    el.elBox.classList.toggle('off', !row);
    if (row) {
      for (const b of el.root.querySelectorAll('.hle-anchor button')) { b.classList.toggle('on', b.dataset.anchor === row.anchor); b.disabled = row.anchor === 'mouse'; }
      el.size.value = row.scale; el.sv.textContent = `${Math.round(row.scale * 100)}%`;
      el.vis.checked = row.visible;
      el.insit.checked = row.situations.includes(L.sit);
      el.sitname.textContent = SITUATIONS[L.sit]?.name ?? L.sit;
      el.tname.textContent = row.name; el.ttext.textContent = row.tip ?? '';
    }
    el.root.querySelector('[data-a="undo"]').disabled = !this.undoS.length;
    el.root.querySelector('[data-a="redo"]').disabled = !this.redoS.length;
    for (const b of L.boxes) b.wrap?.classList.toggle('hl-sel', b.id === this.selId);
  }
  // SCREEN: the HUD, or one of the panels (data/panellayout.js), opened for editing on top of the paused world.
  screen(id) {
    if (id !== 'hud' && !PANELS[id]) return false;
    if (id === this.scr) return true;
    if (id === 'hud') { this.pe.leave(true); this.scr = 'hud'; this.lay.force(this.lay.sit === 'panel' ? 'on_foot' : this.lay.sit); }
    else { this.select(null, false); if (!this.pe.enter(id)) { this.render(); return false; } this.scr = id; this.lay.force('panel'); }
    this.render();
    return true;
  }
  // The editor card moves out of the way by its title bar.
  dragCard(e) {
    if (e.target.closest('button')) return;
    const c = this.el.panel, b = c.getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top;
    const mv = (ev) => { c.style.left = `${Math.max(0, Math.min(innerWidth - 60, ev.clientX - sx))}px`; c.style.top = `${Math.max(0, Math.min(innerHeight - 40, ev.clientY - sy))}px`; c.style.transform = 'none'; };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
    e.preventDefault();
  }
  select(id, draw = true) { this.selId = id && this.lay.byId[id] ? id : null; if (draw && this.open) this.render(); else for (const b of this.lay.boxes) b.wrap?.classList.remove('hl-sel'); }

  click(e) {
    const t = e.target.closest('button');
    if (!t) return;
    const g = t.closest('[data-g]')?.dataset.g;
    if (g === 'screen') { this.screen(t.dataset.v); return; }
    if (this.scr !== 'hud' && this.pe.click(t, g)) return;
    if (g === 'preset') { this.push(); this.lay.setPreset(t.dataset.v); this.lay.force(this.lay.forced ?? this.lay.sit); this.render(); return; }
    if (g === 'sit') { this.situation(t.dataset.v); return; }
    if (t.dataset.anchor && this.selId) { this.setAnchor(this.selId, t.dataset.anchor); return; }
    const m = t.dataset.m;
    if (m === 'close') { this.el.modal.classList.add('hidden'); return; }
    if (m === 'copy') { this.el.mArea.select(); navigator.clipboard?.writeText(this.el.mArea.value).then(() => { this.el.mSay.textContent = 'Copied.'; }, () => { this.el.mSay.textContent = 'Select the text and copy it (Ctrl C).'; }); return; }
    if (m === 'apply') { this.push(this.snapState(this.importKind ?? 'H')); const bad = (this.importKind === 'P' ? this.hud.panels : this.lay).importLayout(this.el.mArea.value); if (bad.length) { this.undoS.pop(); this.el.mSay.textContent = bad.slice(0, 4).join(' · '); } else { this.el.modal.classList.add('hidden'); this.render(); this.hud.toast('HUD layout imported'); } return; }
    switch (t.dataset.a) {
      case 'close': this.hide(); break;
      case 'min': this.el.panel.classList.toggle('min'); break;
      case 'undo': this.undo(); break;
      case 'redo': this.redo(); break;
      case 'resetone': if (this.selId) { this.push(); this.lay.reset(this.selId); this.render(); } break;
      case 'resetall': this.push(); this.lay.reset(); this.render(); this.hud.toast('HUD layout reset · UNDO brings it back'); break;
      case 'export': this.importKind = 'H'; this.modal('EXPORT', 'Your layout as JSON. Rows are in data/hudlayout.js\'s shape: paste them over HUD_LAYOUT to make this the standard.', JSON.stringify(this.lay.exportLayout(), null, 1), false); break;
      case 'import': this.importKind = 'H'; this.modal('IMPORT', 'Paste a layout ({ preset, edits } or { rows }) and APPLY. A layout with problems is refused and named.', '', true); break;
      default:
    }
  }
  modal(title, text, value, importing) {
    const el = this.el;
    el.mTitle.textContent = title; el.mText.textContent = text; el.mArea.value = value; el.mSay.textContent = '';
    el.modal.querySelector('[data-m="apply"]').classList.toggle('hidden', !importing);
    el.modal.querySelector('[data-m="copy"]').classList.toggle('hidden', importing);
    el.modal.classList.remove('hidden');
    el.mArea.focus();
  }

  situation(v) {
    this.lay.force(v === 'auto' ? null : v);
    if (v === 'auto') this.lay.refresh();
    this.render();
  }
  toggleSituation() {
    const row = this.selId && this.lay.byId[this.selId]?.row;
    if (!row) return;
    const s = this.lay.sit, list = row.situations.filter((x) => x !== s);
    if (this.el.insit.checked) list.push(s);
    this.change(row.id, { situations: list });
  }
  setAnchor(id, anchor) {
    const L = this.lay, b = L.byId[id];
    if (!b?.wrap) return;
    // keep it where it is on screen: the same box, measured from the new corner
    this.change(id, { anchor, ...offsetFor(anchor, L.W, L.H, b.sw, b.sh, b.x, b.y, L.L) });
  }
  change(id, fields, coalesce = null) {
    const now = performance.now();
    if (!coalesce || coalesce !== this.lastKind || now - this.lastT > 600) this.push();
    this.lastKind = coalesce; this.lastT = now;
    const bad = this.lay.edit(id, fields);
    if (bad.length) { this.undoS.pop(); this.hud.toast(bad[0], 'warn'); }
    this.render();
    return bad;
  }

  // ---- undo -------------------------------------------------------------------------------------------------------
  // One stack for both: an entry is 'H|' + the HUD layout or 'P|' + the panel layout, put back by its kind.
  snapState(kind = this.scr === 'hud' ? 'H' : 'P') { return `${kind}|${kind === 'H' ? this.lay.snapshot() : this.hud.panels.snapshot()}`; }
  restoreSnap(s) { const st = JSON.parse(s.slice(2)); if (s[0] === 'H') this.lay.setState(st); else this.hud.panels.setState(st); }
  push(s = this.snapState()) { this.undoS.push(s); if (this.undoS.length > 60) this.undoS.shift(); this.redoS.length = 0; }
  undo() { const s = this.undoS.pop(); if (!s) return false; this.redoS.push(this.snapState(s[0])); this.restoreSnap(s); this.render(); return true; }
  redo() { const s = this.redoS.pop(); if (!s) return false; this.undoS.push(this.snapState(s[0])); this.restoreSnap(s); this.render(); return true; }

  // ---- the mouse ----------------------------------------------------------------------------------------------------
  down(e) {
    if (!this.open || this.scr !== 'hud' || e.button !== 0) return;
    const w = e.target.closest('.hl');
    if (!w) return;
    const b = w.__hl;
    this.select(b.id);
    this.drag = { b, grip: !!e.target.closest('.hl-grip'), sx: e.clientX, sy: e.clientY, x0: b.x, y0: b.y, w: b.sw, h: b.sh, scale0: b.row.scale, before: this.snapState('H'), moved: false };
    try { w.setPointerCapture(e.pointerId); } catch { /* synthetic events have no capture */ }
    e.preventDefault();
  }
  move(e) {
    const d = this.drag;
    if (!d) return;
    const L = this.lay, b = d.b, dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    d.moved = true;
    if (d.grip) {
      const a = ANCHORS[b.row.anchor], sx = a.ax === 1 ? -1 : a.ax === 0.5 ? 2 : 1, sy = a.ay === 1 ? -1 : a.ay === 0.5 ? 2 : 1;
      const scale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, d.scale0 * (1 + (dx * sx + dy * sy) / Math.max(20, d.w + d.h))));
      L.edit(b.id, { scale: Math.round(scale * 100) / 100 }, { save: false });
    } else {
      let x = d.x0 + dx, y = d.y0 + dy, gx = null, gy = null;
      if (!e.shiftKey) ({ x, y, gx, gy } = this.snap(b, x, y, d.w, d.h));
      this.guides(gx, gy);
      L.edit(b.id, offsetFor(b.row.anchor, L.W, L.H, d.w, d.h, x, y, L.L), { save: false });
    }
    this.render();
  }
  up() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.guides(null, null);
    if (d.moved) { this.push(d.before); this.lay.save(); this.render(); }
  }
  wheel(e) {
    if (!this.open || this.scr !== 'hud') return;
    const w = e.target.closest('.hl');
    if (!w) return;
    e.preventDefault();
    const b = w.__hl;
    this.select(b.id);
    this.change(b.id, { scale: b.row.scale * (e.deltaY < 0 ? 1.06 : 1 / 1.06) }, 'wheel');
  }
  // Snap the box's left / centre / right (and top / middle / bottom) to the screen's edges and centre and to every other
  // shown box's edges and centres, within 8 px.
  snap(b, x, y, w, h) {
    const L = this.lay;
    let bx = SNAP + 1, by = SNAP + 1, ox = 0, oy = 0, gx = null, gy = null;
    const tryX = (t) => { for (const m of [0, w / 2, w]) { const dd = t - (x + m); if (Math.abs(dd) < Math.abs(bx)) { bx = dd; ox = dd; gx = t; } } };
    const tryY = (t) => { for (const m of [0, h / 2, h]) { const dd = t - (y + m); if (Math.abs(dd) < Math.abs(by)) { by = dd; oy = dd; gy = t; } } };
    tryX(0); tryX(L.W / 2); tryX(L.W); tryY(0); tryY(L.H / 2); tryY(L.H);
    for (const o of L.boxes) {
      if (o === b || !o.wrap || !o.shown) continue;
      tryX(o.x); tryX(o.x + o.sw / 2); tryX(o.x + o.sw);
      tryY(o.y); tryY(o.y + o.sh / 2); tryY(o.y + o.sh);
    }
    return { x: Math.abs(bx) <= SNAP ? x + ox : x, y: Math.abs(by) <= SNAP ? y + oy : y, gx: Math.abs(bx) <= SNAP ? gx : null, gy: Math.abs(by) <= SNAP ? gy : null };
  }
  guides(gx, gy) {
    const { gx: X, gy: Y } = this.el;
    X.classList.toggle('hidden', gx === null); Y.classList.toggle('hidden', gy === null);
    if (gx !== null) X.style.transform = `translateX(${gx}px)`;
    if (gy !== null) Y.style.transform = `translateY(${gy}px)`;
  }

  // ---- the keyboard (only while open; the game is paused and never sees these) --------------------------------------
  key(e) {
    if (!this.open) return;
    if (e.target?.tagName === 'TEXTAREA') { if (e.code === 'Escape') { this.el.modal.classList.add('hidden'); e.stopImmediatePropagation(); } else e.stopImmediatePropagation(); return; }
    const id = this.selId, b = id && this.lay.byId[id], step = e.shiftKey ? 10 : 1;
    if (this.scr !== 'hud' && !e.ctrlKey && !e.metaKey && e.code !== 'Escape' && e.code !== 'F6') { if (this.pe.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); } else e.stopImmediatePropagation(); return; }
    let done = true;
    if (e.code === 'Escape' || e.code === 'F6') { if (!this.el.modal.classList.contains('hidden')) this.el.modal.classList.add('hidden'); else this.hide(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { if (e.shiftKey) this.redo(); else this.undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') this.redo();
    else if (b && b.wrap && e.code.startsWith('Arrow')) {
      const L = this.lay, x = b.x + (e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0), y = b.y + (e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0);
      this.change(id, offsetFor(b.row.anchor, L.W, L.H, b.sw, b.sh, x, y, L.L), 'nudge');
    } else if (b && (e.code === 'KeyH' || e.code === 'Delete')) this.change(id, { visible: !b.row.visible });
    else if (b && (e.code === 'Equal' || e.code === 'Minus')) this.change(id, { scale: b.row.scale * (e.code === 'Equal' ? 1.06 : 1 / 1.06) }, 'wheel');
    else done = false;
    if (done) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
}
