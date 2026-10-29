// THE TABLE (docs/design/WEB_CASINOS.md §3.6): blackjack and chess on green felt, opened by sitting down (E at a seat;
// systems/casinos.js sit). The world holds still while it is open, like the travel boards; the keys go to it.
//   Blackjack: [ and ] the bet, SPACE deal, H hit, S stand, D double, P split, C palm a card (cheat), ESC stand up.
//   Chess: click a piece then a square (or type e2e4 and ENTER), R resign, ESC stand up (resigns a game in play).
// Its regions are rows in data/panellayout.js (`table`), so the HUD editor (F6) can move and size them.
// No purple: felt green, rail leather, brass, bone, the HUD's own tokens.

const CSS = `
.tb-wrap { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 40; pointer-events: auto; background: oklch(0.08 0.01 60 / 0.55); }
.tb-wrap.hidden { display: none; }
.tb { position: relative; width: min(900px, 94vw); max-height: 90vh; overflow: auto; padding: 18px 24px 16px; color: var(--bone, #efe6d6);
  background: radial-gradient(ellipse at 50% 30%, oklch(0.44 0.09 155), oklch(0.3 0.07 155) 60%, oklch(0.22 0.05 155));
  border: 10px solid oklch(0.3 0.05 50); border-radius: 0.625rem 0.625rem 42% 42% / 0.625rem 0.625rem 11% 11%; padding-bottom: 34px;
  box-shadow: inset 0 0 0 2px oklch(0.62 0.1 85), inset 0 0 60px rgba(0,0,0,0.45), 0 18px 46px rgba(0,0,0,0.7); }
.tb-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.tb-kind { font: 800 13px var(--stencil, 'Arial Narrow'); letter-spacing: 0.32em; color: oklch(0.8 0.1 85); }
.tb-title { font: 900 30px/1 var(--stencil, 'Arial Narrow'); letter-spacing: 0.04em; color: var(--sand, #e7d6b4); text-transform: uppercase; text-shadow: 2px 2px 0 rgba(0,0,0,0.5); }
.tb-sub { font: 600 14px var(--display, 'Arial Narrow'); color: oklch(0.85 0.04 120); letter-spacing: 0.06em; text-transform: uppercase; }
.tb-cash { text-align: right; font: 800 12px var(--stencil, 'Arial Narrow'); letter-spacing: 0.2em; color: oklch(0.8 0.1 85); }
.tb-cash b { display: block; font: 900 24px var(--stencil, 'Arial Narrow'); color: var(--sand, #e7d6b4); letter-spacing: 0.04em; }
.tb-rows { margin-top: 12px; display: flex; flex-direction: column; gap: 10px; }
.tb-row { display: flex; align-items: center; gap: 14px; min-height: 104px; }
.tb-who { width: 120px; font: 800 13px var(--stencil, 'Arial Narrow'); letter-spacing: 0.18em; color: oklch(0.85 0.06 85); text-transform: uppercase; }
.tb-who small { display: block; font: 600 13px var(--display, 'Arial Narrow'); letter-spacing: 0.04em; color: var(--bone, #efe6d6); }
.tb-cards { display: flex; gap: 8px; flex-wrap: wrap; }
.tb-card { width: 62px; height: 88px; border-radius: 7px; background: linear-gradient(170deg, #fbf6ea, #e8dfcc); color: #1a1a18; position: relative;
  box-shadow: 2px 3px 0 rgba(0,0,0,0.45); font: 800 22px Georgia, serif; display: flex; align-items: center; justify-content: center; transition: transform 0.2s; }
.tb-card .c { position: absolute; left: 6px; top: 4px; font-size: 15px; line-height: 1; text-align: center; }
.tb-card.red { color: #b8302a; }
.tb-card.back { background: repeating-linear-gradient(45deg, oklch(0.42 0.12 30), oklch(0.42 0.12 30) 6px, oklch(0.36 0.1 30) 6px, oklch(0.36 0.1 30) 12px); border: 3px solid #efe6d2; }
.tb-card:hover { transform: translateY(-3px); }
.tb-hand { padding: 6px 8px; border-radius: 0.625rem; }
.tb-hand.on { box-shadow: 0 0 0 2px oklch(0.8 0.12 85); }
.tb-tot { font: 800 15px var(--stencil, 'Arial Narrow'); letter-spacing: 0.12em; color: var(--sand, #e7d6b4); margin-top: 4px; text-transform: uppercase; }
.tb-tot .res { margin-left: 8px; color: oklch(0.85 0.15 85); } .tb-tot .res.lose { color: oklch(0.7 0.16 30); }
.tb-chips { display: flex; gap: 6px; align-items: center; margin-top: 10px; font: 800 18px var(--stencil, 'Arial Narrow'); color: var(--sand, #e7d6b4); }
.tb-chip { width: 34px; height: 34px; border-radius: 50%; border: 4px dashed #efe6d2; background: oklch(0.55 0.17 30); box-shadow: 1px 2px 0 rgba(0,0,0,0.5); }
.tb-chip.b { background: oklch(0.45 0.09 240); } .tb-chip.k { background: #1a1a18; } .tb-chip.g { background: oklch(0.7 0.13 85); }
.tb-board { display: grid; grid-template-columns: repeat(8, 52px); grid-template-rows: repeat(8, 52px); border: 6px solid oklch(0.3 0.05 50); width: max-content; box-shadow: 3px 4px 0 rgba(0,0,0,0.45); }
.tb-sq { display: flex; align-items: center; justify-content: center; font: 400 38px/1 'Segoe UI Symbol', 'DejaVu Sans', serif; cursor: pointer; user-select: none; transition: background 0.2s; }
.tb-sq.l { background: #e8d8b0; } .tb-sq.d { background: #8a6038; }
.tb-sq.sel { background: oklch(0.75 0.13 85); } .tb-sq.last { box-shadow: inset 0 0 0 3px oklch(0.7 0.14 140); } .tb-sq:hover { filter: brightness(1.08); }
.tb-sq .w { color: #fbf6ea; text-shadow: 0 0 2px #000, 0 1px 1px #000; } .tb-sq .k { color: #1a1410; }
.tb-chessside { display: flex; gap: 18px; align-items: flex-start; margin-top: 12px; }
.tb-moves { font: 400 15px/1.5 var(--type, monospace); color: var(--bone, #efe6d6); min-width: 180px; }
.tb-say { margin-top: 10px; padding: 8px 12px; font: 400 15px/1.3 var(--type, monospace); color: oklch(0.22 0.015 60); background: linear-gradient(175deg, oklch(0.9 0.035 86), oklch(0.8 0.045 80)); border-left: 5px solid oklch(0.55 0.15 35); transform: rotate(-0.3deg); }
.tb-foot { margin-top: 12px; display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; font: 600 14px var(--display, 'Arial Narrow'); color: oklch(0.88 0.04 120); text-transform: uppercase; letter-spacing: 0.05em; }
.tb-foot kbd { background: oklch(0.25 0.03 60); border: 1px solid oklch(0.5 0.05 85); border-radius: 4px; padding: 0 5px; margin-right: 4px; color: var(--sand, #e7d6b4); }
`;
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const cardHTML = (c) => {
  if (c === '??') return '<div class="tb-card back"></div>';
  const r = c.slice(0, -1), s = c.slice(-1), red = s === 'H' || s === 'D';
  return `<div class="tb-card${red ? ' red' : ''}"><span class="c">${r}<br>${SUIT[s]}</span>${SUIT[s]}</div>`;
};

export class TablePanel {
  constructor(game, root) {
    this.g = game; this.open = false; this.cas = null; this.bet = 0; this.say = ''; this.sel = -1; this.typed = '';
    if (typeof document === 'undefined') return;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    this.wrap = document.createElement('div'); this.wrap.className = 'tb-wrap hidden';
    this.panel = document.createElement('div'); this.panel.className = 'tb';
    this.wrap.appendChild(this.panel); (root ?? document.body).appendChild(this.wrap);
    this.panel.addEventListener('click', (e) => { const q = e.target.closest?.('[data-sq]'); if (q) this.square(+q.dataset.sq); });
    this.onKeyDown = (e) => {
      if (!this.open) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      this.key(e.code, e.key);
    };
    this.onKeyUp = (e) => { if (this.open) { e.preventDefault(); e.stopImmediatePropagation(); } };
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
  }
  show(cas) {
    this.cas = cas; this.open = true; this.say = ''; this.sel = -1; this.typed = '';
    const s = cas.seat; this.bet = Math.max(s.v.row.min, Math.min(s.v.row.max, this.bet || s.v.row.min));
    this.wasPaused = this.g.paused; this.g.paused = true; this.g.input?.down?.clear?.();
    this.render(); this.wrap?.classList.remove('hidden');
  }
  close() {
    if (!this.open) return;
    this.open = false; this.wrap?.classList.add('hidden');
    this.g.paused = this.wasPaused ?? false; this.g.input?.down?.clear?.(); this.g.input?.phys?.clear?.();
    if (this.cas?.seat) this.cas.leave('stood up');
  }
  // One key (also the agent's path through the casino command: it calls the system, not this).
  key(code, ch) {
    const C = this.cas, s = C?.seat; if (!s) { this.close(); return; }
    if (code === 'Escape') { this.close(); return; }
    let r = null;
    if (s.game === 'blackjack') {
      const R = s.v.row, step = R.min >= 50 ? 50 : R.min >= 5 ? 5 : 1;
      if (code === 'BracketLeft') this.bet = Math.max(R.min, this.bet - step);
      else if (code === 'BracketRight') this.bet = Math.min(R.max, this.bet + step);
      else if (code === 'Space') r = C.bet(this.bet);
      else if (code === 'KeyH') r = C.act('hit'); else if (code === 'KeyS') r = C.act('stand');
      else if (code === 'KeyD') r = C.act('double'); else if (code === 'KeyP') r = C.act('split'); else if (code === 'KeyC') r = C.act('palm');
    } else {
      if (code === 'KeyR') r = C.resign();
      else if (code === 'Enter') { r = C.move(this.typed); this.typed = ''; }
      else if (code === 'Backspace') this.typed = this.typed.slice(0, -1);
      else if (/^[a-h1-8qn]$/i.test(ch ?? '')) this.typed = (this.typed + ch.toLowerCase()).slice(-5);
    }
    if (r) this.say = r.ok ? (r.caught === true ? 'The dealer\'s hand closes on your wrist. "Out."' : r.caught === false ? 'The ace slides home. Nobody blinks.' : '') : r.why;
    if (!C.seat) { this.close(); return; }
    this.render();
  }
  square(i) {
    const C = this.cas, s = C?.seat; if (!s || s.game !== 'chess') return;
    const b = s.t.chess?.S.b; if (!b) return;
    if (this.sel < 0 || (b[i] && b[i] === b[i].toUpperCase())) { if (b[i] && b[i] === b[i].toUpperCase()) this.sel = i; this.render(); return; }
    const f = this.sel; this.sel = -1;
    const name = (k) => String.fromCharCode(97 + (k & 7)) + ((k >> 3) + 1);
    const r = C.move(name(f) + name(i)); this.say = r.ok ? '' : r.why;
    this.render();
  }
  render() {
    if (!this.panel || !this.cas?.seat) return;
    const g = this.g, s = this.cas.seat, v = s.v, t = s.t;
    const head = `<div class="tb-head"><div><div class="tb-kind">${esc(v.row.name)}</div><div class="tb-title">${esc(v.name)}</div>
      <div class="tb-sub">${s.game === 'chess' ? `chess · ${esc(t.dealer.name)} · stake $${t.chess?.stake ?? 0}` : `blackjack · ${t.shoe.decks} deck${t.shoe.decks > 1 ? 's' : ''} · dealer ${v.kind === 'backroom' ? 'hits' : 'stands on'} soft 17 · natural pays ${v.kind === 'backroom' ? '6:5' : '3:2'}`}</div></div>
      <div class="tb-cash">ON YOU<b>$${g.cash}</b>${s.game === 'blackjack' ? `THE HOUSE<b>$${this.cas.house(v)}</b>` : `THEIR PURSE<b>$${t.purse}</b>`}</div></div>`;
    let body = '', foot = [];
    if (s.game === 'blackjack') {
      const V = t.bj?.view();
      const dealer = V ? V.dealer.map(cardHTML).join('') : '<div class="tb-card back"></div><div class="tb-card back"></div>';
      const hands = V ? V.hands.map((h, i) => `<div class="tb-hand${V.phase === 'play' && i === V.active ? ' on' : ''}"><div class="tb-cards">${h.cards.map(cardHTML).join('')}</div>
        <div class="tb-tot">${h.soft && h.total <= 21 ? 'soft ' : ''}${h.total} · $${h.bet}${h.result ? `<span class="res${['lose', 'bust', 'forfeit'].includes(h.result) ? ' lose' : ''}">${h.result}${h.back ? ` +$${h.back}` : ''}</span>` : ''}</div></div>`).join('') : '';
      body = `<div class="tb-rows"><div class="tb-row"><div class="tb-who">Dealer<small>${esc(t.dealer.name)}</small></div><div><div class="tb-cards">${dealer}</div>${V?.dealerTotal ? `<div class="tb-tot">${V.dealerTotal}</div>` : ''}</div></div>
        <div class="tb-row"><div class="tb-who">You</div><div class="tb-cards">${hands}</div></div></div>
        <div class="tb-chips"><span class="tb-chip"></span><span class="tb-chip b"></span><span class="tb-chip k"></span><span class="tb-chip g"></span>&nbsp;BET $${this.bet} <span style="opacity:.7;font-size:13px">&nbsp;($${v.row.min}-$${v.row.max})</span></div>`;
      foot = V?.phase === 'play' ? [['H', 'hit'], ['S', 'stand'], ...(V.canDouble ? [['D', 'double']] : []), ...(V.canSplit ? [['P', 'split']] : []), ['C', 'palm a card'], ['ESC', 'stand up']] : [['[ ]', 'bet'], ['SPACE', 'deal'], ['ESC', 'stand up']];
    } else {
      const V = this.cas.chessView(t), last = t.chess?.moves.at(-1);
      const lf = last ? [last.slice(0, 2), last.slice(2, 4)] : [];
      let sq = '';
      for (let r = 7; r >= 0; r--) for (let f = 0; f < 8; f++) {
        const i = r * 8 + f, p = V.board?.[i] ?? '', nm = String.fromCharCode(97 + f) + (r + 1);
        sq += `<div class="tb-sq ${(r + f) % 2 ? 'l' : 'd'}${this.sel === i ? ' sel' : ''}${lf.includes(nm) ? ' last' : ''}" data-sq="${i}">${p ? `<span class="${p === p.toUpperCase() ? 'w' : 'k'}">${GLYPH[p.toUpperCase()]}</span>` : ''}</div>`;
      }
      body = `<div class="tb-chessside"><div class="tb-board">${sq}</div><div class="tb-moves"><div class="tb-who">${V.over ? esc(V.over) : V.status === 'check' ? 'check' : V.turn === 'w' ? 'your move' : 'thinking'}</div>
        <div>${(V.moves ?? []).map((m, i) => `${i % 2 ? '' : `${Math.floor((i + (V.movesFrom ?? 0)) / 2) + 1}. `}${m}`).join(' ')}</div><div style="margin-top:8px">${this.typed ? `&gt; ${esc(this.typed)}_` : ''}</div></div></div>`;
      foot = V.over ? [['ESC', 'stand up']] : [['CLICK', 'piece, then square'], ['e2e4 ENTER', 'type a move'], ['R', 'resign'], ['ESC', 'stand up']];
    }
    const say = this.say || (t.last && s.game === 'blackjack' ? `Last hand: staked $${t.last.staked}, back $${t.last.paid}.` : '');
    this.panel.innerHTML = `${head}${body}${say ? `<div class="tb-say">${esc(say)}</div>` : ''}<div class="tb-foot">${foot.map(([k, x]) => `<span><kbd>${esc(k)}</kbd>${esc(x)}</span>`).join('')}</div>`;
  }
}
