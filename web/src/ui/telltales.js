// TELLTALES: the body's and the car's warning lamps, a row of stamped-steel dash lamps across the top of the screen,
// hung under the brass compass ribbon (ui/feedback.js) and the subtitle line (radio, barks) so neither is covered
// (docs/design/WEB_SURVIVAL.md §3.13). Each lamp is one state that is wrong right now (systems/survival.js telltales()):
// a stencil icon lit in its severity (bone, amber, rust, blood; blood pulses), four notches for how bad, the word under
// it. The CONDITION plate at the head of the row folds them all into one number. The tunnel: when g.needs.sight drops
// (panic, freezing, heatstroke), the edges of the world go dark around you (the sight consumer). Change-only DOM
// writes at 4 Hz; nothing allocates in the steady state. Its own styles, in the HUD's own tokens (ui/hud.css).

const P = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONS = {
  water: P('<path d="M12 2.8c3.6 4.1 6.2 7.3 6.2 10.5a6.2 6.2 0 0 1-12.4 0c0-3.2 2.6-6.4 6.2-10.5z"/><path d="M9.2 14.2a3 3 0 0 0 2.6 2.9"/>'),
  food: P('<rect x="5.5" y="5" width="13" height="15" rx="1.6"/><path d="M5.5 9h13M5.5 16h13M9 3.2h6"/>'),
  rest: P('<path d="M3 11.5c2.5 3.2 5.6 4.8 9 4.8s6.5-1.6 9-4.8"/><path d="M5.4 14.6 4 16.8M9.4 16.2l-.7 2.5M14.6 16.2l.7 2.5M18.6 14.6l1.4 2.2"/>'),
  cold: P('<path d="M12 2.5v19M4.2 7l15.6 10M19.8 7 4.2 17"/><path d="M9.6 3.8 12 6.2l2.4-2.4M9.6 20.2 12 17.8l2.4 2.4"/>'),
  hot: P('<path d="M9 14.4V5a2 2 0 0 1 4 0v9.4a4 4 0 1 1-4 0z"/><path d="M11 14.5V9"/><path d="M17 4.5l1.6-1.6M17.5 9h2.3M17 13.5l1.6 1.6"/>'),
  wet: P('<path d="M8 3.5c2 2.4 3.6 4.4 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2 1.6-4 3.6-6.4z"/><path d="M16.2 9.5c2 2.4 3.6 4.4 3.6 6.4a3.6 3.6 0 0 1-7.2 0c0-2 1.6-4 3.6-6.4z"/>'),
  cut: P('<path d="M4.5 19.5 19.5 4.5"/><path d="M8.5 9.5 10 11M13 14l1.5 1.5"/><path d="M17.2 20.6c1-1.1 1.6-2 1.6-2.8a1.6 1.6 0 0 0-3.2 0c0 .8.6 1.7 1.6 2.8z" fill="currentColor"/>'),
  bite: P('<path d="M3.5 8.5c2.2 4.4 5.2 6.6 8.5 6.6s6.3-2.2 8.5-6.6"/><path d="M7 11.2 8 8.4l1 3.6M11 12.8l1-3.4 1 3.4M15 12l1-3.6 1 2.8"/><path d="M12 18.5v2.6" stroke-dasharray="1.2 1.6"/>'),
  joint: P('<path d="M7 2.5v8.2l5.6 3.6v7.2"/><circle cx="7" cy="10.8" r="2.4"/><path d="M14.5 6.8 16.6 4.7M15.8 10.2h2.8M13.6 3.6V1.8"/>'),
  bone: P('<path d="M8.4 15.6 15.6 8.4"/><circle cx="6.4" cy="15.3" r="2"/><circle cx="8.7" cy="17.6" r="2"/><circle cx="15.3" cy="6.4" r="2"/><circle cx="17.6" cy="8.7" r="2"/>'),
  burn: P('<path d="M12 21.5c4 0 7-2.8 7-6.6 0-3.6-2.5-5.6-4-8.2-.8 2-2 3-3 3.6.5-3.1-1-6.2-3.6-8.3.3 3.6-3.4 6.2-3.4 11.2 0 4.6 3 8.3 7 8.3z"/>'),
  germ: P('<circle cx="12" cy="12" r="4.6"/><path d="M12 3v2.8M12 18.2V21M3 12h2.8M18.2 12H21M5.6 5.6l2 2M16.4 16.4l2 2M5.6 18.4l2-2M16.4 7.6l2-2"/><path d="M10.5 11h.01M13.4 13.2h.01"/>'),
  fever: P('<path d="M8 14.4V5a2 2 0 0 1 4 0v9.4a4 4 0 1 1-4 0z"/><path d="M10 14.6V8"/><path d="M15.5 6c.9-.9 1.8.9 2.7 0s1.8.9 2.7 0M15.5 10.5c.9-.9 1.8.9 2.7 0s1.8.9 2.7 0"/>'),
  sick: P('<circle cx="12" cy="12" r="9"/><path d="M7.6 15.6c.9-.9 1.8.9 2.7 0s1.8.9 2.7 0 1.8.9 2.7 0"/><path d="M8.6 9.4l1.6 1M15.4 9.4l-1.6 1"/>'),
  fear: P('<path d="M2 12.5h4.2l2-6.5 4 13 3-10 2 3.5H22"/>'),
  gloom: P('<path d="M7 14.6h10a4 4 0 0 0 0-8h-.4A6 6 0 0 0 5.2 8.6 3.5 3.5 0 0 0 7 14.6z"/><path d="M9 17.6 8 20.4M13 17.6l-1 2.8M17 17.6l-1 2.8"/>'),
  boredom: P('<path d="M6 2.8h12M6 21.2h12"/><path d="M7.2 2.8c0 4.6 3.6 6.2 4.8 9.2-1.2 3-4.8 4.6-4.8 9.2M16.8 2.8c0 4.6-3.6 6.2-4.8 9.2 1.2 3 4.8 4.6 4.8 9.2"/><path d="M9.8 19h4.4"/>'),
  hold: P('<path d="M3 11.2 12 4l9 7.2V21H3z"/><path d="M9 21v-6.2h6V21"/><path d="M7.5 17.8h9"/>'),
  car: P('<path d="M2.8 16.2v-3.4l2.2-5.3h14l2.2 5.3v3.4z"/><circle cx="7.4" cy="16.6" r="1.9"/><circle cx="16.6" cy="16.6" r="1.9"/><path d="M6.5 12.4h11"/>'),
  rough: P('<path d="M18.6 12.8A7 7 0 1 1 10.4 4.6a5.4 5.4 0 0 0 8.2 8.2z"/><path d="M2.5 21h19"/>'),
  oil: P('<path d="M2.8 10.5h4l1.6-1.8h5.2l1 1.8 5.6-2.6-6 8.1H5.2l-2.4-3.4z"/><path d="M20.6 15c.6.9 1 1.6 1 2.2a1 1 0 0 1-2 0c0-.6.4-1.3 1-2.2z"/>'),
  engineHot: P('<path d="M12 3v10.6"/><path d="M12 6h2.6M12 9h2.6"/><circle cx="12" cy="16.2" r="2.8"/><path d="M2.5 21.2c1.6-1 3.2 1 4.8 0s3.2 1 4.8 0 3.2 1 4.8 0 3.2 1 4.8 0"/>'),
  tyre: P('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6"/><path d="M12 3v3.2M12 17.8V21M3 12h3.2M17.8 12H21M5.6 5.6l2.3 2.3M16.1 16.1l2.3 2.3"/>'),
  brake: P('<circle cx="12" cy="12" r="5.6"/><path d="M4.4 5.6a9.6 9.6 0 0 0 0 12.8M19.6 5.6a9.6 9.6 0 0 1 0 12.8"/><path d="M12 9.2v3.4M12 15h.01"/>'),
  engine: P('<path d="M4.2 9h3l1.8-2h5.6v2h3l2 2.2v5.6h-2V19H8.6l-2.2-3H4.2z"/><path d="M2 11v4.4M10 4h3.4"/>'),
  fuel: P('<path d="M4.5 21V5.2a2 2 0 0 1 2-2h5.6a2 2 0 0 1 2 2V21M3.2 21h12.2M6.8 9h5"/><path d="M14.1 11.2h2a2 2 0 0 1 2 2v3a1 1 0 0 0 2 0V8.4l-3-3"/>'),
  wrench: P('<path d="M14.6 6.2a4.2 4.2 0 0 0 5.2 5.2l-8.6 8.6a2.2 2.2 0 0 1-3.2-3.2z"/><path d="M14.6 6.2 17.4 3.4a4.2 4.2 0 0 1 3.2 3.2l-2.8 2.8"/>'),
};

const CSS = `
.tt-rail { position: absolute; top: calc(118px * var(--s)); left: 50%; transform: translateX(-50%) scale(var(--s)); transform-origin: 50% 0; display: flex; align-items: flex-start; gap: 7px; pointer-events: none; z-index: 6; filter: drop-shadow(2px 4px 2px rgba(0,0,0,0.55)); }
.tt-rail.empty { display: none; }
.tt-cond { width: 92px; height: 62px; padding: 5px 8px 6px 9px; display: flex; flex-direction: column; justify-content: space-between; background: var(--speckle), linear-gradient(172deg, oklch(0.31 0.01 70), oklch(0.2 0.008 70)); border: 1px solid oklch(0.1 0.01 60); border-left: 4px solid var(--cc, oklch(0.8 0.16 75)); box-shadow: inset 0 1px 0 rgba(255,250,235,0.12); clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%); }
.tt-cond span { font: 700 11px var(--display); letter-spacing: 0.14em; color: var(--muted); text-shadow: 1px 1px 0 #000; }
.tt-cond b { font: 800 27px var(--display); line-height: 0.9; color: var(--cc, var(--sand)); text-shadow: 1px 2px 0 rgba(0,0,0,0.85); }
.tt-cond em { font: 700 12px var(--stencil); font-style: normal; letter-spacing: 0.08em; color: var(--sand); text-shadow: 1px 1px 0 #000; white-space: nowrap; }
.tt { --lc: oklch(0.88 0.035 82); width: 64px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
.tt-lamp { position: relative; width: 56px; height: 56px; display: grid; place-items: center; background: radial-gradient(circle at 50% 46%, color-mix(in oklch, var(--lc) 26%, transparent) 0, transparent 62%), var(--speckle), linear-gradient(172deg, oklch(0.27 0.009 70), oklch(0.15 0.008 70)); border: 1px solid oklch(0.09 0.01 60); box-shadow: inset 0 1px 0 rgba(255,250,235,0.13), inset 0 0 0 3px oklch(0.2 0.008 70), inset 0 0 0 4px oklch(0.1 0.01 60); clip-path: polygon(7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px), 0 7px); }
.tt-lamp::before, .tt-lamp::after { content: ''; position: absolute; top: 5px; width: 4px; height: 4px; border-radius: 50%; background: radial-gradient(circle at 35% 35%, oklch(0.62 0.01 75), oklch(0.24 0.01 70)); }
.tt-lamp::before { left: 5px; } .tt-lamp::after { right: 5px; }
.tt-lamp svg { width: 32px; height: 32px; color: var(--lc); filter: drop-shadow(0 0 4px color-mix(in oklch, var(--lc) 70%, transparent)); margin-top: -4px; }
.tt-notch { position: absolute; left: 11px; right: 11px; bottom: 5px; height: 4px; display: flex; gap: 3px; }
.tt-notch i { flex: 1; background: oklch(0.12 0.01 60); box-shadow: inset 0 1px 0 rgba(0,0,0,0.6); }
.tt-notch i.on { background: var(--lc); box-shadow: 0 0 4px color-mix(in oklch, var(--lc) 70%, transparent); }
.tt-word { max-width: 76px; padding: 2px 5px 1px; font: 700 11px/1.05 var(--stencil); letter-spacing: 0.06em; text-align: center; color: oklch(0.15 0.01 60); background: var(--lc); clip-path: polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%); text-transform: uppercase; }
.tt[data-pip="2"] { --lc: oklch(0.8 0.16 75); }
.tt[data-pip="3"] { --lc: oklch(0.68 0.18 45); }
.tt[data-pip="4"] { --lc: oklch(0.6 0.22 27); }
.tt[data-pip="4"] .tt-lamp svg { animation: tt-pulse 0.9s steps(2) infinite; }
.tt.good { --lc: oklch(0.74 0.14 150); }
.tt.fresh .tt-lamp { animation: tt-in 0.5s ease-out; }
@keyframes tt-pulse { 50% { opacity: 0.35; } }
@keyframes tt-in { 0% { transform: scale(1.45); filter: brightness(2.2); } 100% { transform: scale(1); filter: brightness(1); } }
.tt-sight { position: absolute; inset: 0; pointer-events: none; z-index: 4; opacity: 0; transition: opacity 0.6s; background: radial-gradient(circle at 50% 50%, transparent var(--tr, 60%), rgba(6,5,4,0.9) calc(var(--tr, 60%) + 24%)); }
`;

export class Telltales {
  constructor(game, host) {
    this.g = game;
    if (!document.getElementById('tt-style')) { const st = document.createElement('style'); st.id = 'tt-style'; st.textContent = CSS; document.head.appendChild(st); }
    host.insertAdjacentHTML('beforeend', '<div class="tt-sight"></div><div class="tt-rail empty"><div class="tt-cond"><span>CONDITION</span><b>100</b><em>SOUND</em></div></div>');
    this.sightEl = host.querySelector('.tt-sight');
    this.rail = host.querySelector('.tt-rail');
    this.cond = this.rail.querySelector('.tt-cond');
    this.condN = this.cond.querySelector('b'); this.condW = this.cond.querySelector('em');
    this.t = 1; this.key = ''; this.lamps = new Map(); this.s = {};
  }
  update(dt) {
    if ((this.t += dt) < 0.25) return;
    this.t = 0;
    const g = this.g, N = g.needs, S = g.survival;
    if (!N || !S) return;
    // The tunnel: what's left of your sight.
    const sight = N.sight ?? 1, r = Math.round(10 + (sight - 0.5) * 100);
    if (r !== this.s.r) { this.s.r = r; this.sightEl.style.setProperty('--tr', `${r}%`); this.sightEl.style.opacity = sight < 0.99 ? '1' : '0'; }
    const list = S.telltales();
    const key = list.map((t) => `${t.id}:${t.pip}:${t.word}`).join('|');
    const C = N.condition;
    if (C.value !== this.s.cv) {
      this.s.cv = C.value; this.condN.textContent = C.value; this.condW.textContent = C.word;
      this.cond.style.setProperty('--cc', C.value >= 85 ? 'oklch(0.74 0.14 150)' : C.value >= 65 ? 'oklch(0.8 0.16 75)' : C.value >= 45 ? 'oklch(0.68 0.18 45)' : 'oklch(0.6 0.22 27)');
    }
    const show = list.length > 0 || C.value < 90;
    if (show !== this.s.show) { this.s.show = show; this.rail.classList.toggle('empty', !show); }
    if (key === this.key) return;
    this.key = key;
    const seen = new Set();
    for (const t of list) {
      seen.add(t.id);
      let L = this.lamps.get(t.id);
      if (!L) {
        const el = document.createElement('div');
        el.className = 'tt fresh';
        el.innerHTML = `<div class="tt-lamp">${ICONS[t.icon] ?? ICONS.germ}<div class="tt-notch"><i></i><i></i><i></i><i></i></div></div><span class="tt-word"></span>`;
        L = { el, word: el.querySelector('.tt-word'), notch: [...el.querySelectorAll('.tt-notch i')], pip: -1, w: '', icon: t.icon };
        this.lamps.set(t.id, L);
        setTimeout(() => el.classList.remove('fresh'), 600);
      }
      if (L.pip !== t.pip) { if (L.pip >= 0 && t.pip > L.pip) { L.el.classList.add('fresh'); setTimeout(() => L.el.classList.remove('fresh'), 600); } L.pip = t.pip; L.el.dataset.pip = t.pip; L.notch.forEach((n, i) => n.classList.toggle('on', i < t.pip)); }
      if (L.w !== t.word) { L.w = t.word; L.word.textContent = t.word; }
      L.el.classList.toggle('good', !!t.good);
      L.el.title = t.title ?? '';
      this.rail.appendChild(L.el); // in the order given (worst first)
    }
    for (const [id, L] of this.lamps) if (!seen.has(id)) { L.el.remove(); this.lamps.delete(id); }
  }
  // What the row shows now, for the agent (hud, screenshots).
  view() { return { shown: !this.rail.classList.contains('empty'), lamps: [...this.lamps.entries()].map(([id, L]) => ({ id, pip: L.pip, word: L.w })), sight: this.s.r ?? null }; }
}
