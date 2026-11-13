import { SICK } from '../data/carousel.js';

// THE RING CONSOLE panel and the ring-sick look (systems/carousel.js; docs/design/WEB_CAROUSEL.md).
//   The panel: a stamped-steel plate over the console, the ring's state on top, its choices in a list. W/S or the arrows
//   (the pad's d-pad: engine/controls.js treats the panel as a menu) move, E / Enter / Space (the pad's A) picks, 1-9 pick
//   straight away, Esc / Tab / Backspace leave. main.js hands it the keys while it is open (you stand still at it).
//   The look: a black cut (the arrival's cold-open), edges that swim (a blurred band masked to the screen's rim, its width
//   and blur by the stacks), and a slow sway of the whole frame (a CSS transform on the game canvas, set ten times a second,
//   eased by a transition: no per-frame work in three.js). The REST vignette and microsleep come from systems/survival.js.
// No purple (hue 270-320 is banned): amber, bone, rust and old steel.

const CSS = `
.ring-panel { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(520px, calc(100vw - 32px)); background:#16130f;
  border:2px solid #6a5a3e; box-shadow:0 0 0 4px #0b0a08, 6px 6px 0 #000; color:#e8dcc0; font:14px/1.35 Inter, system-ui, sans-serif; z-index:40; pointer-events:auto; }
.ring-panel.hidden { display:none; }
.ring-panel .rp-head { padding:12px 16px 8px; border-bottom:1px solid #3a3226; display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
.ring-panel .rp-name { font-weight:700; letter-spacing:-0.01em; font-size:17px; color:#ffb347; }
.ring-panel .rp-state { font:600 12px monospace; color:#c9b48a; text-transform:uppercase; }
.ring-panel .rp-sick { padding:6px 16px; font:12px monospace; color:#d8a060; border-bottom:1px solid #2a241c; }
.ring-panel ul { list-style:none; margin:0; padding:6px 0; }
.ring-panel li { padding:8px 16px; display:grid; grid-template-columns:22px 1fr; gap:8px; cursor:pointer; transition:background .2s; }
.ring-panel li b { font:700 12px monospace; color:#8a7a5a; }
.ring-panel li span { display:block; font-weight:600; }
.ring-panel li em { display:block; font-style:normal; font-size:12px; color:#9a8a6a; }
.ring-panel li.sel, .ring-panel li:hover { background:#2c2418; }
.ring-panel li.sel span { color:#ffb347; }
.ring-panel li.off span, .ring-panel li.off b { color:#5f5544; }
.ring-panel .rp-foot { padding:8px 16px 12px; font:12px monospace; color:#7a6c52; border-top:1px solid #2a241c; }
.ring-black { position:absolute; inset:0; background:#000; opacity:0; pointer-events:none; z-index:39; transition:opacity 1.6s ease-in; }
.ring-blur { position:absolute; inset:0; pointer-events:none; opacity:0; transition:opacity 1.2s;
  -webkit-mask-image:radial-gradient(ellipse at center, transparent 60%, #000 100%); mask-image:radial-gradient(ellipse at center, transparent 60%, #000 100%); }
.title .ring-born { display:block; margin:8px auto 0; background:#1d1810; color:#ffb347; border:2px solid #6a5a3e; padding:10px 18px; font:700 15px Inter, system-ui, sans-serif;
  letter-spacing:0.06em; cursor:pointer; transition:background .2s, color .2s; }
.title .ring-born:hover { background:#3a2c18; color:#fff1c8; }
.title .ring-born .rb-sub { display:block; font:400 11px Inter, system-ui, sans-serif; letter-spacing:0; color:#b8a27a; margin-top:2px; }
.title .ring-born .rb-pad { display:inline-block; margin-left:6px; width:18px; height:18px; border-radius:50%; background:#c9a227; color:#16130f; font:700 11px/18px Inter, sans-serif; letter-spacing:0; }
`;

export class CarouselUI {
  constructor(game, root, sys) {
    this.g = game; this.sys = sys; this.open = false; this.sel = 0; this.rows = []; this.station = null;
    const host = root ?? document.body;
    if (!document.getElementById('ring-css')) { const st = document.createElement('style'); st.id = 'ring-css'; st.textContent = CSS; document.head.appendChild(st); }
    // the swimming edges sit under the HUD (first in the root: only the canvas is behind them)
    this.blurEl = document.createElement('div'); this.blurEl.className = 'ring-blur'; host.prepend(this.blurEl);
    this.blackEl = document.createElement('div'); this.blackEl.className = 'ring-black'; host.appendChild(this.blackEl);
    this.el = document.createElement('div'); this.el.className = 'ring-panel hidden';
    this.el.innerHTML = '<div class="rp-head"><span class="rp-name"></span><span class="rp-state"></span></div><div class="rp-sick"></div><ul></ul><div class="rp-foot">W/S or d-pad · E or A picks · 1-9 · Esc leaves</div>';
    host.appendChild(this.el);
    this.nameEl = this.el.querySelector('.rp-name'); this.stateEl = this.el.querySelector('.rp-state'); this.sickEl = this.el.querySelector('.rp-sick'); this.list = this.el.querySelector('ul');
    this.swayN = 0; this.swayT = 0; this.blackT = 0; this.phase = 0;
  }

  show(station) {
    this.station = station; this.open = true; this.sel = 0;
    this.el.classList.remove('hidden');
    this.refresh();
    const i = this.rows.findIndex((r) => !r.off); this.sel = i < 0 ? this.rows.length - 1 : i; this.paintSel();
    this.g.audio?.blip?.();
    this.g.emit('ringConsole', { station: station.id, open: true });
  }
  close() { if (!this.open) return; this.open = false; this.el.classList.add('hidden'); this.g.emit('ringConsole', { station: this.station?.id ?? null, open: false }); }

  refresh() {
    const s = this.station, sys = this.sys;
    this.rows = sys.options(s);
    this.nameEl.textContent = s.name;
    this.stateEl.textContent = `${s.region} · ${sys.stateOf(s)}`;
    const n = sys.st.sick;
    this.sickEl.textContent = n ? `RING-SICK ${'■'.repeat(n)}${'□'.repeat(SICK.max - n)} · aim +${Math.round(SICK.spread * n * 100)}%` : 'not ring-sick';
    this.list.innerHTML = '';
    this.rows.forEach((r, i) => {
      const li = document.createElement('li');
      li.className = r.off ? 'off' : '';
      li.innerHTML = `<b>${i + 1}</b><div><span></span><em></em></div>`;
      li.querySelector('span').textContent = r.label; li.querySelector('em').textContent = r.sub ?? '';
      li.onclick = () => { this.sel = i; this.pick(); };
      this.list.appendChild(li);
    });
    this.paintSel();
  }
  paintSel() { [...this.list.children].forEach((li, i) => li.classList.toggle('sel', i === this.sel)); }

  pick() {
    const r = this.rows[this.sel];
    if (!r || r.off) { this.g.audio?.empty?.(); return null; }
    if (r.id === 'leave') { this.close(); return { ok: true, left: true }; }
    const res = this.sys.choose(this.station, r.id);
    if (!res.ok) this.g.hud?.toast?.(res.why.toUpperCase(), 'warn');
    if (res.ok && (r.id === 'roulette' || r.id === 'backspin' || r.id.startsWith('pair:'))) this.close();
    else if (this.open) this.refresh();
    return res;
  }

  // The keys while it is open (main.js: the player stands still at the console).
  input(I) {
    const n = this.rows.length;
    if (I.hit('Escape') || I.hit('Tab') || I.hit('Backspace')) { this.close(); return; }
    if (I.hit('KeyW') || I.hit('ArrowUp')) { this.sel = (this.sel - 1 + n) % n; this.paintSel(); }
    if (I.hit('KeyS') || I.hit('ArrowDown')) { this.sel = (this.sel + 1) % n; this.paintSel(); }
    for (let k = 1; k <= Math.min(9, n); k++) if (I.hit(`Digit${k}`)) { this.sel = k - 1; this.paintSel(); this.pick(); return; }
    if (I.hit('KeyE') || I.hit('Enter') || I.hit('Space')) this.pick();
  }

  // ---- the look ------------------------------------------------------------------------------------------------------------
  // A black cut: full at once, then it lifts after `hold` seconds.
  black(k, hold) { const e = this.blackEl; e.style.transition = 'none'; e.style.opacity = String(k); void e.offsetWidth; e.style.transition = ''; this.blackT = hold; }
  sick(n) {
    this.swayN = n;
    const b = SICK.blur * n; // the swimming share of the half-width
    this.blurEl.style.opacity = n ? '1' : '0';
    if (n) {
      this.blurEl.style.backdropFilter = this.blurEl.style.webkitBackdropFilter = `blur(${(1.5 + 14 * b).toFixed(1)}px)`;
      const m = `radial-gradient(ellipse at center, transparent ${Math.round(100 - 100 * b * 1.6)}%, #000 100%)`;
      this.blurEl.style.maskImage = this.blurEl.style.webkitMaskImage = m;
    }
    if (!n) { const cv = this.g.renderer?.domElement; if (cv) cv.style.transform = ''; }
  }
  update(dt) {
    if (this.blackT > 0 && (this.blackT -= dt) <= 0) this.blackEl.style.opacity = '0';
    if (this.open && this.station) { this.stateEl.textContent = `${this.station.region} · ${this.sys.stateOf(this.station)}`; }
    if (!this.swayN) return;
    this.phase += dt;
    if ((this.swayT -= dt) > 0) return;
    this.swayT = 0.1;
    const cv = this.g.renderer?.domElement; if (!cv) return;
    const a = SICK.sway * this.swayN, t = this.phase;
    cv.style.transition = 'transform 0.1s linear';
    cv.style.transform = `scale(${(1 + 0.012 * this.swayN).toFixed(3)}) rotate(${(a * Math.sin(t * 0.7)).toFixed(3)}deg) translate(${(a * 9 * Math.sin(t * 0.43)).toFixed(1)}px, ${(a * 6 * Math.cos(t * 0.51)).toFixed(1)}px)`;
  }
}
