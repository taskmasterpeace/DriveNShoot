import { FEED } from '../data/worldvoice.js';

// THE RADIO FEED on the HUD (docs/design/WEB_WORLD_VOICE.md §3.3): the `radiofeed` row of the HUD layout
// (data/hudlayout.js; ui/hudedit.js places it, F6 moves it). The last lines a feed station read while you listened,
// newest on top, each with its frequency; it fades after FEED.hud.holdSecs and shows nothing until a line comes in.
const CSS = `
.rf-feed{display:flex;flex-direction:column;gap:3px;width:330px;padding:6px 9px 7px;pointer-events:none;color:var(--bone,#efe6d2);
 background:linear-gradient(90deg,oklch(0.18 0.02 60 / .82),oklch(0.18 0.02 60 / .35));border-left:3px solid var(--gold,#e0a83a);
 font:600 12.5px var(--display,system-ui);line-height:1.25;transition:opacity .6s}
.rf-feed.idle{opacity:0}
.rf-feed .rf-h{font:800 10.5px var(--display,system-ui);letter-spacing:.16em;color:var(--sand,#c8b48a)}
.rf-feed .rf-l{opacity:.95}.rf-feed .rf-l + .rf-l{opacity:.62;font-size:11.5px}
.rf-feed .rf-f{color:var(--gold,#e0a83a);font-weight:800;margin-right:5px}`;

export class RadioFeedUI {
  constructor(g, ui) {
    this.g = g; this.lines = []; this.at = -1e9; this.shown = '';
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.el = document.createElement('div'); this.el.className = 'rf-feed idle';
    this.el.innerHTML = '<div class="rf-h">ON THE AIR</div>';
    (ui ?? document.body).appendChild(this.el);
  }
  push(S, text) {
    this.lines.unshift({ f: S.freq ?? '', n: S.name, text }); if (this.lines.length > FEED.hud.lines) this.lines.length = FEED.hud.lines;
    this.at = this.g.time; this.render();
  }
  render() {
    if (!this.el) return;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const html = `<div class="rf-h">ON THE AIR · ${esc(this.lines[0]?.n ?? '')}</div>` + this.lines.map((l) => `<div class="rf-l"><span class="rf-f">${esc(l.f)}</span>${esc(l.text)}</div>`).join('');
    if (html !== this.shown) { this.el.innerHTML = html; this.shown = html; }
  }
  update() {
    if (!this.el) return;
    const idle = !this.lines.length || this.g.time - this.at > FEED.hud.holdSecs || this.g.radio?.station?.kind !== 'feed';
    if (idle !== this.el.classList.contains('idle')) this.el.classList.toggle('idle', idle);
  }
}
