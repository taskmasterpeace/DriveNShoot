// The travel and brine-room counters, the arrivals hall, and the cards (docs/design/WEB_CLONE_TRAVEL.md): one panel in the
// HUD's language (riveted steel plate, stencil heads, typed paper rows), opened with E at a pole, a station, a field or a
// vat; the world holds still while it is open (like the pause menu) and the keys go to it, not to the game.
//   show(model)  model: { kind, title, sub, note, rows: [{ key, cols: [...], dim, mark, hot }], foot: [[key, text]], onKey(code) -> bool|'close', hall }
//   card(kind, lines)  a stamped slip over the screen for a few seconds (came up in the brine, arrived, died flat)
// No purple anywhere: steel, bone, brass, rust, the HUD's own tokens.

const CSS = `
.tp-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: auto; z-index: 40; }
.tp-wrap.hall { background: radial-gradient(ellipse at 50% 40%, oklch(0.24 0.02 60), oklch(0.1 0.01 60) 75%); }
.tp-wrap.dim { background: oklch(0.08 0.01 60 / 0.55); }
.tp { width: min(860px, 92vw); max-height: 88vh; overflow: auto; padding: 22px 26px 18px; color: var(--bone, #efe6d6);
  background: linear-gradient(170deg, oklch(0.34 0.012 70), oklch(0.22 0.01 70) 60%, oklch(0.19 0.01 60));
  border: 2px solid oklch(0.45 0.02 70); box-shadow: inset 0 0 0 1px oklch(0.15 0.01 60), 0 14px 40px rgba(0,0,0,0.7), 6px 8px 0 rgba(0,0,0,0.45);
  clip-path: polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px)); position: relative; }
.tp::before, .tp::after { content: ''; position: absolute; top: 9px; width: 9px; height: 9px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, oklch(0.7 0.02 70), oklch(0.3 0.01 60)); box-shadow: 0 1px 1px rgba(0,0,0,0.7); }
.tp::before { left: 9px; } .tp::after { right: 9px; }
.tp-kind { font: 800 15px var(--stencil, 'Arial Narrow'); letter-spacing: 0.32em; color: var(--rust, #c8602c); }
.tp-title { font: 900 40px/1 var(--stencil, 'Arial Narrow'); letter-spacing: 0.04em; color: var(--sand, #e7d6b4); text-shadow: 2px 2px 0 rgba(0,0,0,0.6); margin: 2px 0 4px; text-transform: uppercase; }
.tp-sub { font: 600 16px var(--display, 'Arial Narrow'); letter-spacing: 0.06em; color: var(--muted, #b6a88f); text-transform: uppercase; }
.tp-note { margin-top: 10px; padding: 8px 12px; font: 400 15px/1.3 var(--type, monospace); color: oklch(0.22 0.015 60); background: linear-gradient(175deg, oklch(0.9 0.035 86), oklch(0.8 0.045 80)); border-left: 5px solid var(--rust, #c8602c); transform: rotate(-0.4deg); box-shadow: 2px 3px 0 rgba(0,0,0,0.5); }
.tp-table { width: 100%; margin-top: 14px; border-collapse: collapse; font: 600 17px var(--display, 'Arial Narrow'); letter-spacing: 0.03em; }
.tp-table th { text-align: left; font: 800 12px var(--stencil, 'Arial Narrow'); letter-spacing: 0.24em; color: var(--brass, #c9a560); padding: 4px 8px; border-bottom: 2px solid oklch(0.45 0.02 70); }
.tp-table td { padding: 6px 8px; border-bottom: 1px solid oklch(0.32 0.012 60); color: var(--bone, #efe6d6); text-transform: uppercase; }
.tp-table tr.dim td { color: oklch(0.55 0.02 70); }
.tp-table tr.hot td { color: var(--gold, #f0b43a); }
.tp-table td.k kbd { min-width: 22px; text-align: center; display: inline-block; }
.tp-table td.mark { color: var(--green, #7fbf6a); font-weight: 800; }
.tp-foot { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px 18px; font: 600 15px var(--display, 'Arial Narrow'); color: var(--muted, #b6a88f); text-transform: uppercase; letter-spacing: 0.05em; }
.tp-cash { position: absolute; right: 26px; top: 22px; text-align: right; font: 800 13px var(--stencil, 'Arial Narrow'); letter-spacing: 0.2em; color: var(--brass, #c9a560); }
.tp-cash b { display: block; font: 900 26px var(--stencil, 'Arial Narrow'); color: var(--sand, #e7d6b4); letter-spacing: 0.04em; }
.tp-card { position: fixed; left: 50%; top: 22%; transform: translateX(-50%) rotate(-1.2deg); min-width: 440px; max-width: 80vw; padding: 18px 30px 16px; pointer-events: none; z-index: 41;
  color: oklch(0.2 0.015 60); background: linear-gradient(175deg, oklch(0.92 0.035 86), oklch(0.8 0.05 78)); border-top: 6px solid var(--rust, #c8602c);
  box-shadow: 4px 6px 0 rgba(0,0,0,0.55), 0 18px 40px rgba(0,0,0,0.5); text-align: center; transition: opacity 0.8s, transform 0.8s;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 97% 96%, 94% 100%, 91% 96%, 88% 100%, 12% 100%, 9% 96%, 6% 100%, 3% 96%, 0 100%); }
.tp-card.fade { opacity: 0; transform: translateX(-50%) translateY(-12px) rotate(-1.2deg); }
.tp-card .h { font: 900 34px/1.05 var(--stencil, 'Arial Narrow'); letter-spacing: 0.06em; text-transform: uppercase; color: oklch(0.32 0.13 35); }
.tp-card .l { font: 400 17px/1.35 var(--type, monospace); text-transform: uppercase; margin-top: 6px; }
.tp-card.black { background: linear-gradient(175deg, oklch(0.24 0.012 60), oklch(0.15 0.01 60)); color: var(--bone, #efe6d6); border-top-color: var(--blood, #c03a2a); }
.tp-card.black .h { color: oklch(0.7 0.16 35); }
`;

export class TravelPanel {
  constructor(game, root) {
    this.g = game;
    this.model = null;
    this.open = false;
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.wrap = document.createElement('div'); this.wrap.className = 'tp-wrap hidden';
    this.panel = document.createElement('div'); this.panel.className = 'tp';
    this.wrap.appendChild(this.panel);
    (root ?? document.body).appendChild(this.wrap);
    this.cardEl = document.createElement('div'); this.cardEl.className = 'tp-card hidden';
    (root ?? document.body).appendChild(this.cardEl);
    this.cardT = 0;
    // The keys go to the panel while it is open (captured before the game's input sees them).
    this.onKeyDown = (e) => {
      if (!this.open) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      const r = this.model?.onKey?.(e.code);
      if (r === 'close' || (e.code === 'Escape' && !this.model?.hall)) this.close();
      else if (r) this.refresh();
    };
    this.onKeyUp = (e) => { if (this.open) { e.preventDefault(); e.stopImmediatePropagation(); } };
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }

  show(model) {
    this.model = model;
    if (!this.wrap) { this.open = true; return; }
    this.open = true;
    this.wasPaused = this.wasPaused ?? this.g.paused;
    this.g.paused = true;
    this.g.input?.down?.clear?.(); // nothing stays held under the panel
    this.render();
    this.wrap.classList.remove('hidden');
  }
  refresh() { if (this.open && this.model?.build) this.model = { ...this.model, ...this.model.build() }; this.render(); }
  close() {
    if (!this.open) return;
    this.open = false;
    if (this.wrap) this.wrap.classList.add('hidden');
    this.g.paused = this.wasPaused ?? false; this.wasPaused = undefined;
    this.g.input?.down?.clear?.(); this.g.input?.phys?.clear?.(); // keys let go under the panel are not still held after it
    const m = this.model; this.model = null;
    m?.onClose?.();
  }

  render() {
    const m = this.model;
    if (!m || !this.panel) return;
    this.wrap.className = `tp-wrap${m.hall ? ' hall' : ' dim'}`;
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    const head = (m.head ?? []).map((h) => `<th>${esc(h)}</th>`).join('');
    const rows = (m.rows ?? []).map((r) => `<tr class="${r.dim ? 'dim' : ''}${r.hot ? ' hot' : ''}"><td class="k">${r.key ? `<kbd>${esc(r.key)}</kbd>` : ''}</td>${r.cols.map((c) => `<td>${esc(c)}</td>`).join('')}<td class="mark">${esc(r.mark ?? '')}</td></tr>`).join('');
    const g = this.g, bank = g.clone?.bank ?? 0;
    this.panel.innerHTML = `
      <div class="tp-cash">ON YOU<b>$${g.cash}</b>${m.showBank ? `BRINE BOOK<b>$${bank}</b>` : ''}</div>
      <div class="tp-kind">${esc(m.kind)}</div>
      <div class="tp-title">${esc(m.title)}</div>
      <div class="tp-sub">${esc(m.sub ?? '')}</div>
      ${m.note ? `<div class="tp-note">${esc(m.note)}</div>` : ''}
      ${rows ? `<table class="tp-table"><thead><tr><th></th>${head}<th></th></tr></thead><tbody>${rows}</tbody></table>` : ''}
      <div class="tp-foot">${(m.foot ?? []).map(([k, t]) => `<span><kbd>${esc(k)}</kbd>${esc(t)}</span>`).join('')}</div>`;
  }

  card(kind, title, lines = [], secs = 5) {
    this.lastCard = { kind, title, lines, at: this.g.time };
    if (!this.cardEl) return;
    const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
    this.cardEl.className = `tp-card${kind === 'flat' || kind === 'dead' ? ' black' : ''}`;
    this.cardEl.innerHTML = `<div class="h">${esc(title)}</div>${lines.filter(Boolean).map((l) => `<div class="l">${esc(l)}</div>`).join('')}`;
    this.cardT = secs;
  }

  update(dt) {
    if (this.cardT > 0 && this.cardEl) {
      this.cardT -= dt;
      if (this.cardT <= 0) this.cardEl.classList.add('fade');
      if (this.cardT <= -1) this.cardEl.classList.add('hidden');
    }
  }
}
