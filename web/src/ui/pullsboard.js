// THE PULLS BOARD (docs/design/WEB_PULLS.md §3.4): only what reached you. Each row is a copy you hold (systems/knowledge.js):
// what it is, who told you and how (the channel), how old the news is, how far its spot is from you, and the window it
// was told with running out, then EXPIRED. What you have since learned of how it went shows under it.
//   chip   the `pulls` row of the HUD layout (data/hudlayout.js; ui/hudedit.js places it, F6 moves it): PULLS n · the
//          nearest, with its distance and bearing. Refreshed twice a second, and only when its text changes.
//   tab    PULLS in the character sheet (`): the whole board, freshest first, expired at the bottom.
const CSS = `
.pulls-chip{display:flex;align-items:center;gap:8px;min-width:170px;max-width:284px;padding:5px 10px 5px 8px;cursor:pointer;pointer-events:auto;color:var(--bone,#efe6d2);font:700 13px var(--display,system-ui);letter-spacing:.04em;
 background:linear-gradient(172deg,var(--steel-hi,#3b3632),var(--steel-lo,#24201c));border:1px solid oklch(0.11 0.01 60);box-shadow:inset 0 1px 0 rgba(255,250,235,.12),3px 4px 0 rgba(0,0,0,.5);clip-path:polygon(8px 0,100% 0,100% 100%,0 100%,0 8px);transition:filter .2s}
.pulls-chip:hover{filter:brightness(1.15)}.pulls-chip.none{opacity:.55}
.pulls-chip b{font:900 18px var(--stencil,system-ui);color:var(--gold,#e0a83a);min-width:18px;text-align:center}
.pulls-chip .pc-t{display:flex;flex-direction:column;line-height:1.15;min-width:0}.pulls-chip .pc-k{font-size:11px;color:var(--sand,#c8b48a);letter-spacing:.12em}
.pulls-chip .pc-n{font-weight:600;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px}
.pb-board{flex:1;min-height:0;overflow-y:auto;padding:12px 18px 14px;border-top:2px solid var(--gold,#e0a83a);position:relative}.pb-board.hidden{display:none}
.pb-list{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
.pb-row{display:grid;grid-template-columns:34px 1fr auto;gap:10px;align-items:start;padding:7px 10px;margin:0;background:oklch(0.17 0.01 60 / .82);border:1px solid oklch(0.12 0.01 60);border-left:3px solid var(--gold,#e0a83a);transition:background .2s}
.pb-row:hover{background:oklch(0.2 0.012 60 / .9)}.pb-row.exp{border-left-color:var(--rust,#a8442a);opacity:.6}.pb-row.need{border-left-color:oklch(0.62 0.12 145)}
.pb-ic{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:oklch(0.26 0.03 70);color:var(--gold,#e0a83a)}.pb-row.exp .pb-ic{color:var(--rust,#a8442a)}
.pb-k{font:800 12px var(--stencil,system-ui);letter-spacing:.12em;color:var(--gold,#e0a83a)}.pb-x{font-size:13px;line-height:1.35;margin:1px 0 3px}
.pb-src{font-size:11.5px;color:var(--muted,#9a8f7c)}.pb-src i{font-style:normal;color:var(--sand,#c8b48a)}.pb-out{font-size:12px;margin-top:3px;color:oklch(0.82 0.08 60)}
.pb-r{text-align:right;font-size:12px;white-space:nowrap}.pb-r .d{font:800 15px var(--stencil,system-ui);color:var(--bone,#efe6d2)}.pb-r .l{color:var(--sand,#c8b48a)}.pb-r .l.bad{color:oklch(0.72 0.15 35)}
.pb-conf{height:3px;background:oklch(0.28 0.01 60);margin-top:4px;width:80px;margin-left:auto}.pb-conf i{display:block;height:100%;background:linear-gradient(90deg,var(--rust,#a8442a),var(--gold,#e0a83a))}
.pb-empty{display:grid;place-items:center;gap:8px;padding:40px 0;color:var(--muted,#9a8f7c);text-align:center}.pb-empty .pb-ic{width:64px;height:64px}
`;
// Lucide-style glyphs (stroke 2), one per fact kind's icon.
const P = {
  thumb: '<path d="M7 10v12"/><path d="M15 5.9 14 10h5.8a2 2 0 0 1 1.9 2.6l-2.3 8A2 2 0 0 1 17.5 22H7V10l4-8a3 3 0 0 1 4 3.9Z"/>',
  car: '<path d="M5 17h14l-1.5-6.5A2 2 0 0 0 15.6 9H8.4a2 2 0 0 0-1.9 1.5Z"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/>',
  wagon: '<rect x="2" y="7" width="13" height="9" rx="1"/><path d="M15 10h4l3 3v3h-7"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-2a5 5 0 0 1 10 0v2"/><circle cx="17" cy="9" r="2.5"/><path d="M15 21v-1.5a4 4 0 0 1 6-3.4"/>',
  cart: '<circle cx="8" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.5 12h11L21 7H6"/>',
  wreck: '<path d="M4 16 7 9h10l3 7"/><path d="M3 16h18v3H3z"/><path d="m9 5 1 2M15 5l-1 2M12 3v3"/>',
  cross: '<path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z"/>',
  radio: '<path d="M4.9 19.1a10 10 0 0 1 0-14.2"/><path d="M7.8 16.2a6 6 0 0 1 0-8.4"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8a6 6 0 0 1 0 8.4"/><path d="M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  skull: '<circle cx="9" cy="11" r="1"/><circle cx="15" cy="11" r="1"/><path d="M8 20v2h8v-2"/><path d="M16 20a2 2 0 0 0 1.6-3.2A8 8 0 1 0 6.4 16.8 2 2 0 0 0 8 20"/>',
  board: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9Z"/>',
  need: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4H8v16a2 2 0 0 1-4 0V9h4"/><path d="M12 8h6M12 12h6M12 16h4"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
};
const ICON = { hitchhiker: 'thumb', stranded: 'car', caravan: 'wagon', refugees: 'people', trader: 'cart', wreck: 'wreck', medic: 'cross', funeral: 'news', distress: 'radio', bounty: 'skull', work: 'board', missing: 'eye', weather: 'cloud', need: 'need', outcome: 'news', place: 'pin' };
const svg = (k, s = 16) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[ICON[k]] ?? P.pin}</svg>`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const km = (m) => (m === null || m === undefined ? '' : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const hrs = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : `${h.toFixed(h < 10 ? 1 : 0)} h`);

export class PullsBoard {
  constructor(g, ui) {
    this.g = g; this.chipEl = null; this.lastKey = '';
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.chipEl = document.createElement('div');
    this.chipEl.className = 'pulls-chip none';
    this.chipEl.innerHTML = `<b>0</b><span class="pc-t"><span class="pc-k">PULLS</span><span class="pc-n">nothing has reached you</span></span>`;
    this.chipEl.onclick = () => g.charSheet?.toggle(true, 'pulls');
    (ui ?? document.body).appendChild(this.chipEl); // the layout lifts it into its row's wrapper (bind)
    this.mount();
    this.timer = setInterval(() => this.refresh(), 500);
  }
  bearing(from, to) { const a = Math.atan2(to.x - from.x, -(to.z - from.z)); return ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][(Math.round(a / (Math.PI / 4)) + 8) % 8]; }
  refresh() {
    const P = this.g.pulls; if (!P || !this.chipEl) return;
    const { n, near } = P.chip(), me = P.me();
    const line = near ? `${near.kind} · ${km(near.distM)} ${this.bearing(me, near.where)}` : n ? `${n} on the board` : 'nothing has reached you';
    const key = `${n}|${line}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.chipEl.classList.toggle('none', n === 0);
    this.chipEl.querySelector('b').textContent = String(n);
    this.chipEl.querySelector('.pc-n').textContent = line;
  }
  // The board's own element inside the character sheet panel (after its card body): an empty state and the list, both always
  // there (the panel's `pulls` and `pulls_empty` regions, data/panellayout.js), shown only while the PULLS tab is.
  mount() {
    const cs = this.g.charSheet?.el; if (!cs || this.boardEl) return this.boardEl ?? null;
    this.boardEl = document.createElement('div');
    this.boardEl.className = 'pb-board hidden';
    this.boardEl.innerHTML = `<div class="pb-empty"><span class="pb-ic">${svg('radio', 32)}</span><div><b>Nothing has reached you.</b></div><div>Buy a drink in a saloon, read a town board, tune a radio, or watch the road.</div></div><div class="pb-list"></div>`;
    cs.appendChild(this.boardEl);
    return this.boardEl;
  }
  show(on) {
    const el = this.mount(); if (!el) return;
    el.classList.toggle('hidden', !on);
    if (!on) return;
    const rows = this.g.pulls?.board() ?? [];
    el.querySelector('.pb-empty').style.display = rows.length ? 'none' : '';
    el.querySelector('.pb-list').innerHTML = this.rowsHTML(rows);
  }
  tabHTML() { return this.rowsHTML(this.g.pulls?.board() ?? []); }
  rowsHTML(rows) {
    const P = this.g.pulls; if (!P) return '';
    const me = P.me();
    return `${rows.map((r) => {
      const left = r.what === 'need' ? '' : r.expired ? '<span class="l bad">EXPIRED</span>' : `<span class="l">${hrs(r.leftH)} left</span>`;
      const where = r.where ? `${km(r.distM)} ${this.bearing(me, r.where)}` : '';
      const src = r.what === 'need' ? 'your own eyes' : `<i>${esc(r.channelName)}</i>${r.channel !== 'saw' ? ` · ${esc(r.from)}` : ''} · ${hrs(r.heardH)} ago${r.ageH - r.heardH > 0.5 ? ` · the news is ${hrs(r.ageH)} old` : ''}${r.where?.place ? ` · ${esc(r.where.place)}` : ''}`;
      return `<div class="pb-row${r.expired ? ' exp' : ''}${r.what === 'need' ? ' need' : ''}"><span class="pb-ic">${svg(r.what)}</span><div><div class="pb-k">${esc(r.kind.toUpperCase())}</div><div class="pb-x">${esc(r.text)}.</div><div class="pb-src">${src}</div>${r.outcome ? `<div class="pb-out">${esc(r.outcome)}.</div>` : ''}</div>
        <div class="pb-r"><div class="d">${where}</div>${left}<div class="pb-conf" title="how sure the one who told you was"><i style="width:${Math.round(r.conf * 100)}%"></i></div></div></div>`;
    }).join('')}`; // the rows of the sheet panel's `pulls` region (data/panellayout.js): F6 sets its columns and density
  }
}
