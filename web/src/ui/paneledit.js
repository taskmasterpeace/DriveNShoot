import { PANELS, PANEL_PRESETS, PANEL_PRESET_IDS, PANEL_ANCHORS, REGION_FIELDS, PANEL_SCALE } from '../data/panellayout.js';

// THE HUD EDITOR on a panel (docs/design/WEB_UI_EDITOR.md §3.8). Picked from the editor's SCREEN strip: the panel opens on
// the paused world, every region (data/panellayout.js) gets its outline and name on an overlay above it (the panel's own
// buttons don't fire while you edit), and the card docks to the side. Click a region to pick it (the smallest box under
// the pointer); drag to nudge it, the wheel to size it; the inspector anchors it inside the panel, scales just its text,
// sets a list's columns and row density, hides it, resets it; the panel's own scale is there but never needed. The
// outlines follow the panel as it re-renders (every 0.4 s while editing: an editor timer, never in play).

const ANCHOR_NAME = { flow: 'IN FLOW', tl: 'TOP L', tc: 'TOP C', tr: 'TOP R', bl: 'BOT L', bc: 'BOT C', br: 'BOT R' };

export class PanelEditMode {
  constructor(ed) {
    this.ed = ed; this.g = ed.g; this.P = ed.hud.panels;
    this.pid = null; this.sel = null; this.boxes = []; this.timer = null; this.drag = null;
    const root = ed.el.root;
    this.layer = document.createElement('div');
    this.layer.className = 'hle-regs';
    root.insertBefore(this.layer, root.querySelector('.hle-panel'));
    this.box = root.querySelector('.hle-pe');
    this.pills = root.querySelector('[data-g="ppreset"]');
    this.pills.innerHTML = PANEL_PRESET_IDS.map((id) => `<button data-v="${id}" title="${PANEL_PRESETS[id].blurb}">${PANEL_PRESETS[id].name}</button>`).join('');
    const sl = (k, lab, [a, b], step) => `<label data-f="${k}"><span>${lab}</span><input type="range" min="${a}" max="${b}" step="${step}"><b class="v"></b></label>`;
    this.box.innerHTML = `
      <div class="hle-rname"></div>
      <div class="hle-pills hle-ptabs"></div>
      <div class="hle-rbody">
        <span class="hle-k">ANCHOR IN THE PANEL</span>
        <div class="hle-pills hle-panchor">${PANEL_ANCHORS.map((a) => `<button data-anchor="${a}">${ANCHOR_NAME[a]}</button>`).join('')}</div>
        ${sl('scale', 'SIZE', REGION_FIELDS.scale, 0.05)}${sl('text', 'TEXT', REGION_FIELDS.text, 0.05)}
        ${sl('cols', 'COLUMNS', REGION_FIELDS.cols, 1)}${sl('density', 'DENSITY', REGION_FIELDS.density, 0.05)}
        <label class="chk"><input type="checkbox" class="hle-rvis"> Visible</label>
        <div class="hle-pills"><button data-a="pregion">RESET REGION</button><button data-a="ppanel">RESET PANEL</button></div>
      </div>
      <div class="hle-rnone">Click a region in the panel: its outline and name are on it.</div>
      ${sl('pscale', 'PANEL', PANEL_SCALE, 0.05)}`;
    for (const lab of this.box.querySelectorAll('label[data-f]')) lab.querySelector('input').addEventListener('input', (e) => this.slider(lab.dataset.f, Number(e.target.value)));
    this.box.querySelector('.hle-rvis').addEventListener('change', (e) => this.change({ visible: e.target.checked }));
    this.layer.addEventListener('pointerdown', (e) => this.down(e));
    this.layer.addEventListener('pointermove', (e) => this.move(e));
    this.layer.addEventListener('pointerup', () => this.up());
    this.layer.addEventListener('pointercancel', () => this.up());
    this.layer.addEventListener('wheel', (e) => this.wheel(e), { passive: false });
  }

  enter(pid) {
    this.leave(true);
    const r = this.P.open(pid, { tab: 1 });
    if (!r?.ok) { this.g.hud.toast(`${PANELS[pid].name}: ${r?.why ?? 'will not open here'}`.toUpperCase(), 'warn'); return false; }
    this.pid = pid; this.sel = null;
    this.layer.innerHTML = PANELS[pid].regions.map((g) => `<div class="hle-rbox${g.list ? ' list' : ''}" data-r="${g.id}"><b>${g.name}</b></div>`).join('');
    this.boxes = [...this.layer.children].map((el) => ({ el, id: el.dataset.r, sel: PANELS[pid].regions.find((g) => g.id === el.dataset.r).sel, r: null }));
    const tabs = [...new Set(PANELS[pid].regions.filter((g) => g.tab).map((g) => g.tab))];
    this.box.querySelector('.hle-ptabs').innerHTML = tabs.length ? `<span class="hle-k">SHOW TAB</span>${tabs.map((t) => `<button data-ptab="${t}">${t}</button>`).join('')}` : '';
    this.place();
    clearInterval(this.timer);
    this.timer = setInterval(() => this.place(), 400);
    return true;
  }
  leave(close = true) {
    clearInterval(this.timer); this.timer = null;
    this.layer.innerHTML = ''; this.boxes = [];
    if (close && this.pid) this.P.close(this.pid);
    this.pid = null; this.sel = null; this.drag = null;
  }

  // Where each region sits now (the panel may have rebuilt its rows since).
  place() {
    if (!this.pid) return;
    const root = this.P.rootEl(this.pid), L = this.P.resolved(this.pid);
    for (const b of this.boxes) {
      const el = root?.querySelector(b.sel), r = el?.getBoundingClientRect(), hidden = L.regions[b.id]?.visible === false;
      b.r = r && r.width > 0 ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
      b.el.style.display = b.r || hidden ? '' : 'none';
      if (b.r) { b.el.style.transform = `translate(${b.r.x}px, ${b.r.y}px)`; b.el.style.width = `${b.r.w}px`; b.el.style.height = `${b.r.h}px`; }
      else if (hidden) { b.el.style.transform = 'translate(0, 0)'; b.el.style.width = '0px'; b.el.style.height = '0px'; }
      b.el.classList.toggle('off', hidden);
      b.el.classList.toggle('sel', b.id === this.sel);
    }
  }
  pick(x, y) {
    let best = null, ba = Infinity;
    for (const b of this.boxes) { const r = b.r; if (r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && r.w * r.h < ba) { ba = r.w * r.h; best = b; } }
    return best?.id ?? null;
  }
  select(id) { this.sel = id; this.place(); this.render(); }

  // ---- the inspector ----------------------------------------------------------------------------------------------------
  render() {
    if (!this.pid) return;
    for (const b of this.pills.children) b.classList.toggle('on', b.dataset.v === this.P.preset);
    const L = this.P.resolved(this.pid), reg = this.sel && PANELS[this.pid].regions.find((g) => g.id === this.sel), e = reg ? L.regions[reg.id] : null, B = this.box;
    B.querySelector('.hle-rname').textContent = reg ? `${PANELS[this.pid].name} · ${reg.name}` : PANELS[this.pid].name;
    B.querySelector('.hle-rbody').classList.toggle('off', !reg);
    B.querySelector('.hle-rnone').style.display = reg ? 'none' : '';
    const set = (f, v, txt, on = true) => { const lab = B.querySelector(`label[data-f="${f}"]`); lab.querySelector('input').value = v; lab.querySelector('.v').textContent = txt; lab.classList.toggle('off', !on); };
    if (reg) {
      const s = e.scale ?? 1, t = e.text ?? 1, c = e.cols ?? reg.cols ?? 1, d = e.density ?? 1;
      set('scale', s, `${Math.round(s * 100)}%`); set('text', t, `${Math.round(t * 100)}%`);
      set('cols', c, reg.list ? String(c) : '—', !!reg.list); set('density', d, reg.list ? `${Math.round(d * 100)}%` : '—', !!reg.list);
      B.querySelector('.hle-rvis').checked = e.visible !== false;
      for (const b of B.querySelectorAll('.hle-panchor button')) b.classList.toggle('on', b.dataset.anchor === (e.anchor ?? 'flow'));
    }
    set('pscale', L.scale, `${Math.round(L.scale * 100)}%`);
  }
  slider(f, v) {
    if (f === 'pscale') { this.commit(() => this.P.edit(this.pid, null, { scale: v }), 'pscale'); return; }
    if (!this.sel) return;
    this.change({ [f]: v }, f);
  }
  change(fields, coalesce = null) { if (this.sel) this.commit(() => this.P.edit(this.pid, this.sel, fields), coalesce); }
  commit(fn, coalesce = null) {
    const ed = this.ed, now = performance.now();
    if (!coalesce || coalesce !== ed.lastKind || now - ed.lastT > 600) ed.push();
    ed.lastKind = coalesce; ed.lastT = now;
    const bad = fn();
    if (bad?.length) { ed.undoS.pop(); this.g.hud.toast(bad[0], 'warn'); }
    requestAnimationFrame(() => this.place());
    ed.render();
    return bad;
  }
  // Clicks in the editor card while a panel is up. Returns true when handled here.
  click(t, g) {
    if (t.dataset.ptab) { this.P.showTab(this.pid, t.dataset.ptab); requestAnimationFrame(() => this.place()); return true; }
    if (g === 'ppreset') { this.commit(() => this.P.setPreset(t.dataset.v)); return true; }
    if (t.dataset.anchor && this.sel) { this.change({ anchor: t.dataset.anchor, dx: 0, dy: 0 }); return true; }
    const a = t.dataset.a;
    if (a === 'pregion' && this.sel) { this.commit(() => this.P.reset(this.pid, this.sel)); return true; }
    if (a === 'ppanel') { this.commit(() => this.P.reset(this.pid)); return true; }
    if (a === 'resetall') { this.commit(() => this.P.reset()); this.g.hud.toast('Panel layouts reset · UNDO brings them back'); return true; }
    if (a === 'export') { this.ed.modal('EXPORT', 'Your panel layouts as JSON ({ preset, edits }: per panel, per region). Paste into IMPORT on another machine.', JSON.stringify(this.P.exportLayout(), null, 1), false); this.ed.importKind = 'P'; return true; }
    if (a === 'import') { this.ed.modal('IMPORT', 'Paste a panel layout ({ preset, edits }) and APPLY. One with problems is refused and named.', '', true); this.ed.importKind = 'P'; return true; }
    return false;
  }

  // ---- the pointer on the overlay ------------------------------------------------------------------------------------------
  down(e) {
    if (!this.pid || e.button !== 0) return;
    const id = this.pick(e.clientX, e.clientY);
    this.select(id);
    if (!id) return;
    const ed0 = this.P.resolved(this.pid).regions[id];
    this.drag = { id, sx: e.clientX, sy: e.clientY, dx0: ed0.dx ?? 0, dy0: ed0.dy ?? 0, before: this.ed.snapState('P'), moved: false };
    try { this.layer.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
    e.preventDefault();
  }
  move(e) {
    const d = this.drag;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 2) return;
    d.moved = true;
    const k = this.P.resolved(this.pid).scale || 1;
    this.P.edit(this.pid, d.id, { dx: Math.round(d.dx0 + dx / k), dy: Math.round(d.dy0 + dy / k) }, { save: false });
    this.place();
  }
  up() {
    const d = this.drag;
    this.drag = null;
    if (d?.moved) { this.ed.push(d.before); this.P.save(); this.render(); this.ed.render(); }
  }
  wheel(e) {
    if (!this.pid) return;
    e.preventDefault();
    const id = this.pick(e.clientX, e.clientY);
    if (!id) return;
    if (id !== this.sel) this.select(id);
    const s = this.P.resolved(this.pid).regions[id].scale ?? 1;
    this.change({ scale: s * (e.deltaY < 0 ? 1.06 : 1 / 1.06) }, 'wheel');
  }
  key(e) {
    if (!this.sel) return false;
    const step = e.shiftKey ? 10 : 1, R = this.P.resolved(this.pid).regions[this.sel];
    if (e.code.startsWith('Arrow')) {
      this.change({ dx: (R.dx ?? 0) + (e.code === 'ArrowLeft' ? -step : e.code === 'ArrowRight' ? step : 0), dy: (R.dy ?? 0) + (e.code === 'ArrowUp' ? -step : e.code === 'ArrowDown' ? step : 0) }, 'nudge');
      return true;
    }
    if (e.code === 'KeyH' || e.code === 'Delete') { this.change({ visible: R.visible === false }); return true; }
    if (e.code === 'Equal' || e.code === 'Minus') { this.change({ scale: (R.scale ?? 1) * (e.code === 'Equal' ? 1.06 : 1 / 1.06) }, 'wheel'); return true; }
    return false;
  }
}
