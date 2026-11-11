// THE KEYHOLDER'S CARD (docs/design/WEB_HOLDOUTS.md): who holds the key of the holdout you just walked into - their name,
// title, vice and law, the town's HOUSE RULES and its paper - on a weathered plate with the Keyholder's real flag as the
// backdrop (everybody's from somewhere). Shown when you pass the gate; systems/holdouts.js calls show(H).
import { drawFlag, FLAGS } from './portrait.js';
import { HOUSE_RULES } from '../data/holdoutgen.js';

const CSS = `
.hkc { position: absolute; top: 92px; right: 22px; width: 360px; pointer-events: none; overflow: hidden; color: oklch(0.94 0.02 82);
  background: oklch(0.17 0.012 60); border: 2px solid oklch(0.1 0.01 60); box-shadow: 0 0 0 1px oklch(0.42 0.02 70 / 0.6) inset, 4px 4px 0 rgba(0,0,0,0.55);
  animation: hkc-in 0.35s ease-out; font: 400 13px/1.35 var(--type, Inter, system-ui, sans-serif); }
.hkc.hidden { display: none; }
@keyframes hkc-in { from { opacity: 0; transform: translateX(24px); } }
.hkc-flag { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.34; filter: saturate(0.85) contrast(1.05); }
.hkc-shade { position: absolute; inset: 0; background: linear-gradient(90deg, oklch(0.14 0.012 60 / 0.92) 0%, oklch(0.14 0.012 60 / 0.55) 62%, oklch(0.14 0.012 60 / 0.2) 100%); }
.hkc-in { position: relative; padding: 12px 14px 12px; display: flex; flex-direction: column; gap: 6px; }
.hkc-town { font: 700 11px var(--display, Inter, sans-serif); letter-spacing: 0.2em; color: oklch(0.78 0.11 75); text-transform: uppercase; }
.hkc-name { font: 800 22px var(--display, Inter, sans-serif); letter-spacing: -0.01em; text-shadow: 1px 2px 0 rgba(0,0,0,0.7); }
.hkc-title { font: 700 11px var(--display, Inter, sans-serif); letter-spacing: 0.16em; color: oklch(0.72 0.03 75); }
.hkc-row { display: grid; grid-template-columns: 52px 1fr; gap: 6px; }
.hkc-k { font: 700 10px var(--display, Inter, sans-serif); letter-spacing: 0.14em; color: oklch(0.66 0.04 70); padding-top: 2px; }
.hkc-rules { margin-top: 2px; border-top: 1px solid oklch(0.1 0.01 60); box-shadow: 0 -1px 0 oklch(0.42 0.02 70 / 0.4); padding-top: 6px; }
.hkc-rule { font: 800 12px var(--display, Inter, sans-serif); letter-spacing: 0.06em; color: oklch(0.86 0.13 60); }
.hkc-rule::before { content: '\\25A0  '; color: oklch(0.6 0.17 35); }
.hkc-foot { display: flex; justify-content: space-between; font: 600 10px var(--display, Inter, sans-serif); letter-spacing: 0.12em; color: oklch(0.7 0.03 75); }
`;

export class HoldoutCard {
  constructor(game, root) {
    this.g = game; this.T = 0; this.shown = null;
    if (!document.getElementById('hkc-css')) { const s = document.createElement('style'); s.id = 'hkc-css'; s.textContent = CSS; document.head.appendChild(s); }
    this.el = document.createElement('div');
    this.el.className = 'hkc hidden';
    root.appendChild(this.el);
  }
  show(H, secs = 9) {
    const G = H.gen;
    if (!G) return;
    const C = G.card, flag = FLAGS[C.flag] ? C.flag : 'US';
    this.el.innerHTML = `<div class="hkc-shade"></div><div class="hkc-in">
      <div class="hkc-town">${H.name} · ${C.hall}</div>
      <div class="hkc-name">${C.name}</div>
      <div class="hkc-title">${C.title} · ${FLAGS[flag].name.toUpperCase()}</div>
      <div class="hkc-row"><span class="hkc-k">LAW</span><span>${C.law}</span></div>
      <div class="hkc-row"><span class="hkc-k">VICE</span><span>${cap(C.vice)}.</span></div>
      <div class="hkc-rules">${G.rules.map((k) => `<div class="hkc-rule">${HOUSE_RULES[k].name}</div>`).join('')}</div>
      <div class="hkc-foot"><span>${G.scrip.name}</span><span>${H.gen.row.motto}</span></div></div>`;
    const f = drawFlag(flag, 360, 240);
    f.className = 'hkc-flag';
    this.el.prepend(f);
    this.el.classList.remove('hidden');
    this.shown = H.id; this.T = secs;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), secs * 1000);
    this.g.emit?.('keyholderCard', { holdout: H.id, name: C.name, flag });
  }
  hide() { this.el.classList.add('hidden'); this.shown = null; }
}
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
