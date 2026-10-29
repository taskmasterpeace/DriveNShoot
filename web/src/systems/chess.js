// CHESS by the rules (docs/design/WEB_CASINOS.md §3.3). Pure: no game, no DOM. Our own small engine, no outside one.
//   board   64 squares, index = rank * 8 + file (a1 = 0, h8 = 63); white pieces 'PNBRQK', black 'pnbrqk', '' empty
//   legal(S)          every legal move of the side to move (castling through no check, en passant, promotion to a
//                     queen or a knight), as { from, to, promo }; a move that leaves your own king in check never appears
//   play(S, m)        a new state after a move (the old one is untouched)
//   status(S)         'play' | 'check' | 'mate' | 'stalemate' | 'draw' (fifty moves, bare kings)
//   think(S, skill)   the NPC's move: alpha-beta to the row's depth over material and a little position, with the row's
//                     blunder chance (a weak player sometimes plays the second-best move). It only ever picks from legal().
// Searches allocate (a state per node); they run once per NPC move, never per frame.

const VAL = { p: 100, n: 310, b: 325, r: 500, q: 900, k: 0 };
const MATE = 100000;
const N_OFF = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const K_OFF = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]], ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const sq = (f, r) => r * 8 + f;
const white = (p) => p !== '' && p === p.toUpperCase();
const sideOf = (p) => (p === '' ? null : white(p) ? 'w' : 'b');
export const SQ = (name) => sq(name.charCodeAt(0) - 97, +name[1] - 1);
export const NAME = (i) => String.fromCharCode(97 + (i & 7)) + ((i >> 3) + 1);

export function start() {
  const b = Array(64).fill('');
  const back = 'RNBQKBNR';
  for (let f = 0; f < 8; f++) { b[sq(f, 0)] = back[f]; b[sq(f, 1)] = 'P'; b[sq(f, 6)] = 'p'; b[sq(f, 7)] = back[f].toLowerCase(); }
  return { b, turn: 'w', castle: { K: true, Q: true, k: true, q: true }, ep: -1, half: 0, moves: 0 };
}
// A position from FEN (the board, side, castling, en passant), for checks and puzzles.
export function fromFEN(fen) {
  const [pos, turn = 'w', cas = '-', ep = '-'] = fen.trim().split(/\s+/);
  const b = Array(64).fill(''), rows = pos.split('/');
  for (let r = 0; r < 8; r++) { let f = 0; for (const ch of rows[7 - r]) { if (/\d/.test(ch)) f += +ch; else b[sq(f++, r)] = ch; } }
  return { b, turn, castle: { K: cas.includes('K'), Q: cas.includes('Q'), k: cas.includes('k'), q: cas.includes('q') }, ep: ep === '-' ? -1 : SQ(ep), half: 0, moves: 0 };
}

// Is square i attacked by `by` ('w' | 'b')?
export function attacked(b, i, by) {
  const f = i & 7, r = i >> 3, W = by === 'w';
  const pr = W ? r - 1 : r + 1, pawn = W ? 'P' : 'p';
  if (pr >= 0 && pr < 8) for (const df of [-1, 1]) { const ff = f + df; if (ff >= 0 && ff < 8 && b[sq(ff, pr)] === pawn) return true; }
  const kn = W ? 'N' : 'n', kg = W ? 'K' : 'k';
  for (const [df, dr] of N_OFF) { const ff = f + df, rr = r + dr; if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[sq(ff, rr)] === kn) return true; }
  for (const [df, dr] of K_OFF) { const ff = f + df, rr = r + dr; if (ff >= 0 && ff < 8 && rr >= 0 && rr < 8 && b[sq(ff, rr)] === kg) return true; }
  const slide = (dirs, a, c) => {
    for (const [df, dr] of dirs) {
      let ff = f + df, rr = r + dr;
      while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) { const p = b[sq(ff, rr)]; if (p) { if (p === a || p === c) return true; break; } ff += df; rr += dr; }
    }
    return false;
  };
  return slide(DIAG, W ? 'B' : 'b', W ? 'Q' : 'q') || slide(ORTH, W ? 'R' : 'r', W ? 'Q' : 'q');
}
const kingAt = (b, side) => b.indexOf(side === 'w' ? 'K' : 'k');
export const inCheck = (S, side = S.turn) => { const k = kingAt(S.b, side); return k >= 0 && attacked(S.b, k, side === 'w' ? 'b' : 'w'); };

function pseudo(S) {
  const b = S.b, me = S.turn, them = me === 'w' ? 'b' : 'w', out = [];
  const add = (from, to, promo) => out.push({ from, to, promo: promo ?? null });
  for (let i = 0; i < 64; i++) {
    const p = b[i]; if (!p || sideOf(p) !== me) continue;
    const f = i & 7, r = i >> 3, t = p.toLowerCase();
    if (t === 'p') {
      const dir = me === 'w' ? 1 : -1, r1 = r + dir, last = me === 'w' ? 7 : 0, home = me === 'w' ? 1 : 6;
      const push = (to) => { if ((to >> 3) === last) { add(i, to, 'q'); add(i, to, 'n'); } else add(i, to); };
      if (r1 >= 0 && r1 < 8 && !b[sq(f, r1)]) {
        push(sq(f, r1));
        if (r === home && !b[sq(f, r + 2 * dir)]) add(i, sq(f, r + 2 * dir));
      }
      for (const df of [-1, 1]) {
        const ff = f + df; if (ff < 0 || ff > 7 || r1 < 0 || r1 > 7) continue;
        const to = sq(ff, r1);
        if ((b[to] && sideOf(b[to]) === them) || to === S.ep) push(to);
      }
    } else if (t === 'n' || t === 'k') {
      for (const [df, dr] of t === 'n' ? N_OFF : K_OFF) {
        const ff = f + df, rr = r + dr; if (ff < 0 || ff > 7 || rr < 0 || rr > 7) continue;
        const to = sq(ff, rr); if (!b[to] || sideOf(b[to]) === them) add(i, to);
      }
      if (t === 'k') {
        const R0 = me === 'w' ? 0 : 7, C = S.castle, Kc = me === 'w' ? 'K' : 'k', Qc = me === 'w' ? 'Q' : 'q', rook = me === 'w' ? 'R' : 'r';
        if (i === sq(4, R0) && !attacked(b, i, them)) {
          if (C[Kc] && b[sq(7, R0)] === rook && !b[sq(5, R0)] && !b[sq(6, R0)] && !attacked(b, sq(5, R0), them) && !attacked(b, sq(6, R0), them)) add(i, sq(6, R0));
          if (C[Qc] && b[sq(0, R0)] === rook && !b[sq(1, R0)] && !b[sq(2, R0)] && !b[sq(3, R0)] && !attacked(b, sq(3, R0), them) && !attacked(b, sq(2, R0), them)) add(i, sq(2, R0));
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : [...DIAG, ...ORTH];
      for (const [df, dr] of dirs) {
        let ff = f + df, rr = r + dr;
        while (ff >= 0 && ff < 8 && rr >= 0 && rr < 8) {
          const to = sq(ff, rr);
          if (b[to]) { if (sideOf(b[to]) === them) add(i, to); break; }
          add(i, to); ff += df; rr += dr;
        }
      }
    }
  }
  return out;
}

export function play(S, m) {
  const b = S.b.slice(), p = b[m.from], t = p.toLowerCase(), me = S.turn, R0 = me === 'w' ? 0 : 7;
  const castle = { ...S.castle };
  let ep = -1, half = S.half + 1;
  if (t === 'p' || b[m.to]) half = 0;
  if (t === 'p' && m.to === S.ep) b[m.to + (me === 'w' ? -8 : 8)] = ''; // en passant takes the pawn beside
  if (t === 'p' && Math.abs(m.to - m.from) === 16) ep = (m.to + m.from) >> 1;
  if (t === 'k' && Math.abs(m.to - m.from) === 2) { // castling moves the rook too
    if (m.to > m.from) { b[sq(5, R0)] = b[sq(7, R0)]; b[sq(7, R0)] = ''; } else { b[sq(3, R0)] = b[sq(0, R0)]; b[sq(0, R0)] = ''; }
  }
  b[m.to] = m.promo ? (me === 'w' ? m.promo.toUpperCase() : m.promo) : p; b[m.from] = '';
  if (t === 'k') { if (me === 'w') castle.K = castle.Q = false; else castle.k = castle.q = false; }
  for (const [i, k] of [[0, 'Q'], [7, 'K'], [56, 'q'], [63, 'k']]) if (m.from === i || m.to === i) castle[k] = false;
  return { b, turn: me === 'w' ? 'b' : 'w', castle, ep, half, moves: S.moves + (me === 'b' ? 1 : 0) };
}

export function legal(S) {
  const out = [];
  for (const m of pseudo(S)) { const n = play(S, m); if (!inCheck(n, S.turn)) out.push(m); }
  return out;
}
export function isLegal(S, m) { return legal(S).some((x) => x.from === m.from && x.to === m.to && (x.promo ?? null) === (m.promo ?? null)); }

export function status(S) {
  const moves = legal(S), chk = inCheck(S);
  if (!moves.length) return chk ? 'mate' : 'stalemate';
  if (S.half >= 100) return 'draw';
  if (S.b.every((p) => !p || p.toLowerCase() === 'k')) return 'draw';
  return chk ? 'check' : 'play';
}

// Material plus a little: pawns forward, knights and bishops toward the middle (white's view).
function evaluate(S) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = S.b[i]; if (!p) continue;
    const t = p.toLowerCase(), W = white(p), f = i & 7, r = i >> 3, rr = W ? r : 7 - r;
    let v = VAL[t];
    if (t === 'p') v += rr * [0, 1, 3, 7, 7, 3, 1, 0][f] - (rr >= 3 && (f === 0 || f === 7) ? 8 : 0); // centre pawns forward, rim pawns stay home
    else if (t === 'n' || t === 'b') v += 12 - 4 * (Math.abs(3.5 - f) + Math.abs(3.5 - r)) / 2 - (rr === 0 ? 14 : 0); // out and toward the middle
    else if (t === 'k' && S.b.filter((q) => q && 'qQ'.includes(q)).length) v += rr === 0 && (f <= 2 || f >= 6) ? 18 : rr === 0 ? 0 : -20; // tucked away while queens are on
    s += W ? v : -v;
  }
  return S.turn === 'w' ? s : -s;
}

function search(S, depth, alpha, beta, ply) {
  const moves = legal(S);
  if (!moves.length) return inCheck(S) ? -MATE + ply : 0;
  if (depth === 0) return evaluate(S);
  for (const m of moves) {
    const v = -search(play(S, m), depth - 1, -beta, -alpha, ply + 1);
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return alpha;
}

// skill: { depth (1..3), blunder (0..1: the chance to take the second-best move) }. rng for the blunder and ties.
export function think(S, skill, rng = Math.random) {
  const moves = legal(S); if (!moves.length) return null;
  const scored = moves.map((m) => ({ m, v: -search(play(S, m), Math.max(0, skill.depth - 1), -MATE - 1, MATE + 1, 1) + rng() * 4 })); // a few points of taste between equal moves
  scored.sort((a, b) => b.v - a.v);
  const pick = scored.length > 1 && rng() < (skill.blunder ?? 0) ? scored[1] : scored[0];
  return pick.m;
}

export const moveName = (m) => NAME(m.from) + NAME(m.to) + (m.promo ? m.promo : '');
export function parseMove(S, txt) {
  const s = String(txt).trim().toLowerCase(); if (!/^[a-h][1-8][a-h][1-8][qn]?$/.test(s)) return null;
  return { from: SQ(s.slice(0, 2)), to: SQ(s.slice(2, 4)), promo: s[4] ?? (/p/i.test(S.b[SQ(s.slice(0, 2))]) && /[18]/.test(s[3]) ? 'q' : null) };
}
