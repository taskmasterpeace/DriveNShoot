import './weaponbar.css';
import { WEAPONS } from '../systems/combat.js';
import { silhouette } from './weaponart.js';
import { BUTTONS, CONTEXTS } from '../engine/controls.js';

// Robert's weapon bar (docs/design/WEB_CONTROLLER.md §3.4): a hotbar of the guns you carry, each a stencilled silhouette;
// the live slot stands proud and raises its fire-mode boxes (SEMI / BURST / AUTO, BUCK / SLUG, SINGLE / FAN) above
// itself only. The number again (or held) steps the boxes; on the pad, RB held opens the weapon wheel over the bar.
// Also the stance and grip tags, and the CONTROLS panel (F2) where every binding row is rebound by pressing the new key or
// button. Change-only DOM writes, at most 15 times a second.
const PAD_NAMES = { a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', back: 'VIEW', start: 'MENU', l3: 'L3', r3: 'R3', up: 'D-UP', down: 'D-DOWN', left: 'D-LEFT', right: 'D-RIGHT' };
const keyName = (k) => k === 'mouse:left' ? 'LMB' : k === 'mouse:right' ? 'RMB' : k === 'wheel' ? 'WHEEL' : k.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Arrow/, '').replace('Left', ' L').replace('Right', ' R').replace('Control', 'CTRL').replace('Shift', 'SHIFT').replace('Equal', '=').replace('Minus', '-').toUpperCase();
const padName = (d) => d ? d.split('+').map((p) => PAD_NAMES[p] ?? p.toUpperCase()).join(' + ') : '';

export class WeaponBar {
  constructor(game, root) {
    this.g = game;
    const hud = root.querySelector('.hud') ?? root;
    hud.insertAdjacentHTML('beforeend', `
      <div class="wbar"><div class="wb-tags"><div class="wb-tag wb-stance"></div><div class="wb-tag wb-grip"></div></div><div class="wb-slots"></div>
        <div class="wb-hint"><kbd>1</kbd>-<kbd>4</kbd> again: fire mode · <kbd>H</kbd> up/down, hold: holster · <kbd>J</kbd> one/two hands · <kbd>RMB</kbd> melee · <kbd>F2</kbd> controls</div></div>
      <div class="wradial hidden"><svg viewBox="-210 -214 420 228"></svg><div class="wr-title">WEAPON WHEEL · <kbd>RS</kbd> pick · <kbd>D-PAD</kbd> mode · let go of <kbd>RB</kbd></div></div>`);
    root.insertAdjacentHTML('beforeend', `<div class="ctl-back hidden"><div class="ctl-card"><div class="ctl-head"><h2>CONTROLS</h2><span>Click a binding, then press the new key, mouse button or pad button. Esc cancels. Saved on this machine.</span></div><div class="ctl-body"></div>
      <div class="ctl-foot"><span class="ctl-pad"></span><span><button data-a="reset">RESET ALL</button> <button data-a="close">CLOSE · F2</button></span></div></div></div>`);
    this.el = { bar: hud.querySelector('.wbar'), slots: hud.querySelector('.wb-slots'), stance: hud.querySelector('.wb-stance'), grip: hud.querySelector('.wb-grip'),
      radial: hud.querySelector('.wradial'), svg: hud.querySelector('.wradial svg'), panel: root.querySelector('.ctl-back'), body: root.querySelector('.ctl-body'), padInfo: root.querySelector('.ctl-pad') };
    this.sig = ''; this.t = 0; this.slotEls = []; this.radSig = '';
    this.capture = null; this.open = false;
    this.el.panel.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'close') this.toggle(false);
      if (a === 'reset') { this.g.controls.reset(); this.renderPanel(); }
      const cell = e.target.closest('.ctl-cell');
      if (cell) { this.capture = { id: cell.dataset.id, kind: cell.dataset.kind, ctx: cell.dataset.ctx }; this.renderPanel(); }
      if (e.target === this.el.panel) this.toggle(false);
    });
    // Capture the next key or mouse button for a rebind, before the game sees it.
    addEventListener('keydown', (e) => {
      if (!this.open) return;
      if (e.code === 'F2' && !this.capture) { this.toggle(false); e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (!this.capture || this.capture.kind !== 'keys') { if (e.code === 'Escape') { this.toggle(false); e.stopImmediatePropagation(); } return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code !== 'Escape') this.g.controls.bind(this.capture.id, { keys: [e.code] });
      this.capture = null; this.renderPanel();
    }, true);
    addEventListener('mousedown', (e) => {
      if (!this.open || !this.capture || this.capture.kind !== 'keys' || e.target.closest('.ctl-cell')) return;
      if (e.button === 0 || e.button === 2) { this.g.controls.bind(this.capture.id, { keys: [e.button === 0 ? 'mouse:left' : 'mouse:right'] }); this.capture = null; this.renderPanel(); e.stopImmediatePropagation(); }
    }, true);
  }

  // ---- the bar -----------------------------------------------------------------------------------------------------------
  update(dt) {
    const g = this.g, A = g.arms, C = g.controls;
    if (!A) return;
    if (C?.hit('controls')) this.toggle(!this.open);
    if (this.open) { this.panelPad(); return; }
    if ((this.t += dt) < 1 / 15 && !A.radialOpen && !this.radSig) return;
    this.t = 0;
    const p = g.player, W = g.inv.weapons, cur = g.inv.current, up = g.time < A.barT;
    const stance = A.drawT > 0 ? 'drawing' : A.stance;
    const sig = `${W.join(',')}|${cur}|${W.map((k) => `${A.modeOf(k).id}:${g.inv.mag[k]}`).join(',')}|${up}|${stance}|${A.grip}|${A.gripWhy}|${p.alive}|${g.invUI?.open}`;
    if (sig !== this.sig) {
      this.sig = sig;
      this.el.bar.classList.toggle('hidden', !p.alive || !!g.invUI?.open || !W.length);
      this.el.stance.className = `wb-tag wb-stance t-${stance}`;
      this.el.stance.innerHTML = `${stance.toUpperCase()}<i>${stance === 'raised' ? 'THEY SEE IT' : stance === 'holstered' ? 'HANDS FREE' : stance === 'drawing' ? 'DRAWING' : 'MUZZLE DOWN'}</i>`;
      this.el.grip.className = `wb-tag wb-grip g-${A.grip}`;
      this.el.grip.innerHTML = `${A.grip === 'one' ? 'ONE HAND' : 'TWO HANDS'}<i>${A.gripWhy === 'chosen' ? (A.grip === 'one' ? 'QUICK · WILD' : 'STEADY · SLOW') : A.gripWhy.toUpperCase()}</i>`;
      if (this.slotEls.length !== W.length || this.slotEls.some((e, i) => e.dataset.k !== W[i])) this.buildSlots(W);
      W.forEach((k, i) => {
        const el = this.slotEls[i], w = WEAPONS[k], on = k === cur, m = A.modeOf(k), modes = A.modes(k);
        el.classList.toggle('on', on);
        el.querySelector('.wb-ammo').textContent = g.inv.mag[k] ?? 0;
        el.querySelector('.wb-ammo').classList.toggle('dry', !(g.inv.mag[k] > 0));
        el.querySelector('.wb-mtag').textContent = modes.length > 1 ? m.name : '';
        const box = el.querySelector('.wb-modes');
        box.classList.toggle('up', on && up && modes.length > 1);
        box.innerHTML = modes.length > 1 ? modes.map((x) => `<div class="wb-box${x.id === m.id ? ' on' : ''}">${x.name}<b class="${x.burst === 0 ? 'auto' : ''}">${x.burst === 0 ? '<i></i>' : '<i></i>'.repeat(Math.min(5, x.burst))}</b></div>`).join('') : '';
        void w;
      });
      this.el.bar.classList.toggle('hint', up);
    }
    this.updateRadial();
  }

  buildSlots(W) {
    this.el.slots.innerHTML = W.map((k, i) => `<div class="wb-slot" data-k="${k}"><div class="wb-modes"></div><img alt="" src="${silhouette(WEAPONS[k], k)}"><b class="wb-num">${i + 1}</b><span class="wb-mtag"></span><span class="wb-ammo"></span></div>`).join('');
    this.slotEls = [...this.el.slots.querySelectorAll('.wb-slot')];
  }

  // ---- the weapon wheel (pad) -------------------------------------------------------------------------------------------
  updateRadial() {
    const g = this.g, A = g.arms;
    if (!A.radialOpen) { if (this.radSig) { this.radSig = ''; this.el.radial.classList.add('hidden'); } return; }
    const W = g.inv.weapons, n = W.length, hov = A.radialSlot, hk = W[hov];
    const sig = `${W.join(',')}|${hov}|${JSON.stringify(A.radialMode)}`;
    if (sig === this.radSig) return;
    this.radSig = sig;
    this.el.radial.classList.remove('hidden');
    const R0 = 96, R1 = 200, parts = [];
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - (i / n) * Math.PI, a1 = Math.PI - ((i + 1) / n) * Math.PI, gap = 0.025;
      const p = (r, a) => `${(Math.cos(a) * r).toFixed(1)} ${(-Math.sin(a) * r).toFixed(1)}`;
      const d = `M ${p(R0, a0 - gap)} L ${p(R1, a0 - gap)} A ${R1} ${R1} 0 0 1 ${p(R1, a1 + gap)} L ${p(R0, a1 + gap)} A ${R0} ${R0} 0 0 0 ${p(R0, a0 - gap)} Z`;
      const am = (a0 + a1) / 2, cx = Math.cos(am) * 150, cy = -Math.sin(am) * 150;
      parts.push(`<g class="wr-wedge${i === hov ? ' on' : ''}"><path d="${d}"/><image href="${silhouette(WEAPONS[W[i]], W[i])}" x="${(cx - 44).toFixed(1)}" y="${(cy - 17).toFixed(1)}" width="88" height="35"/><text x="${(cx - 40).toFixed(1)}" y="${(cy - 18).toFixed(1)}">${i + 1}</text><text x="${(cx + 2).toFixed(1)}" y="${(cy + 34).toFixed(1)}" text-anchor="middle" style="font-size:12px">${WEAPONS[W[i]].short}</text></g>`);
    }
    // the hovered gun's modes on the inner arc
    const modes = hk ? A.modes(hk) : [], cm = A.radialMode[hk];
    modes.forEach((m, j) => {
      const x = (j - (modes.length - 1) / 2) * 62, y = -52;
      parts.push(`<g class="wr-mode${m.id === cm ? ' on' : ''}"><rect x="${x - 28}" y="${y - 13}" width="56" height="26" rx="3"/><text x="${x}" y="${y + 4}" text-anchor="middle">${m.name}</text></g>`);
    });
    this.el.svg.innerHTML = parts.join('');
  }

  // ---- the CONTROLS panel -------------------------------------------------------------------------------------------------
  toggle(on) {
    const g = this.g;
    if (on === this.open) return;
    this.open = on; this.capture = null;
    this.el.panel.classList.toggle('hidden', !on);
    if (on) { this.wasPaused = g.paused; g.paused = true; this.renderPanel(); }
    else g.paused = this.wasPaused ?? false;
    g.emit('controlsPanel', { open: on });
  }
  renderPanel() {
    const C = this.g.controls;
    let html = '', group = '';
    for (const r of C.rows) {
      if (r.group !== group) { group = r.group; html += `<div class="ctl-group">${group}</div>`; }
      const clash = C.clashes(r.id).length > 0, cap = this.capture?.id === r.id;
      const pads = CONTEXTS.filter((c) => r.pad[c]).map((c) => `${c === 'foot' ? '' : `${c}: `}${padName(r.pad[c])}`).join(' · ');
      html += `<div class="ctl-row"><span class="lbl">${r.label}</span>`
        + `<span class="ctl-cell${cap && this.capture.kind === 'keys' ? ' cap' : ''}${clash ? ' clash' : ''}" data-id="${r.id}" data-kind="keys">${cap && this.capture.kind === 'keys' ? 'PRESS A KEY…' : r.keys.map(keyName).join(' / ') || '—'}</span>`
        + `<span class="ctl-cell${cap && this.capture.kind === 'pad' ? ' cap' : ''}" data-id="${r.id}" data-kind="pad" data-ctx="foot">${cap && this.capture.kind === 'pad' ? 'PRESS A PAD BUTTON…' : pads || '—'}</span></div>`;
    }
    this.el.body.innerHTML = html;
    const P = C.pad;
    this.el.padInfo.textContent = P.connected ? `PAD: ${P.id.slice(0, 48)}` : 'NO PAD · plug one in and press a button';
  }
  // Pad capture: the first button that goes down rebinds the row's on-foot button.
  panelPad() {
    const C = this.g.controls;
    if (!this.capture || this.capture.kind !== 'pad') return;
    for (const [name, i] of Object.entries(BUTTONS)) {
      if (C.pad.v[i] > 0.5 && !(C.prev[i] > 0.5)) {
        C.bind(this.capture.id, { pad: name, ctx: this.capture.ctx ?? 'foot' });
        this.capture = null; this.renderPanel();
        return;
      }
    }
  }
}
