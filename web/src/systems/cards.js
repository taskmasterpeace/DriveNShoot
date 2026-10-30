// BLACKJACK (21) by the rules, nothing faked (docs/design/WEB_CASINOS.md §3.2). Pure: no game, no DOM, so the table,
// the agent and the selftest all play the same hand.
//   Shoe(decks, pen, rng)   a real shoe: 52 x decks cards, shuffled once (Fisher-Yates), dealt from the front until the
//                           cut card (pen of the shoe); then the dealer reshuffles. Every card dealt is one of the shoe's.
//   Blackjack(rule, shoe)   one seat against the dealer: bet -> deal -> hit / stand / double / split -> the dealer plays
//                           by the row (stands on soft 17, or hits it) -> settle. Returns what moved: { paid, net }.
// The money is NOT here: the table (systems/casinos.js) takes the bet out of your pocket and pays out of the house's
// cage, by exactly what settle() says.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const cardValue = (c) => { const r = c.slice(0, -1); return r === 'A' ? 11 : r === 'J' || r === 'Q' || r === 'K' ? 10 : +r; };
// Hi-Lo: 2-6 +1, 7-9 0, tens and aces -1 (what a counter keeps in their head; the dealer's eye keeps it too).
export const hiLo = (c) => { const v = cardValue(c); return v <= 6 ? 1 : v >= 10 ? -1 : 0; };

export class Shoe {
  constructor(decks = 6, pen = 0.75, rng = Math.random) {
    this.decks = decks; this.pen = pen; this.rng = rng;
    this.cards = []; this.i = 0; this.shuffles = 0; this.running = 0; this.dealt = 0;
    this.shuffle();
  }
  get size() { return 52 * this.decks; }
  shuffle() {
    const a = this.cards; a.length = 0;
    for (let d = 0; d < this.decks; d++) for (const s of SUITS) for (const r of RANKS) a.push(r + s);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    this.i = 0; this.running = 0; this.shuffles++;
  }
  needsShuffle() { return this.i >= Math.floor(this.cards.length * this.pen); }
  draw() {
    if (this.i >= this.cards.length) this.shuffle(); // past the end: never deal a card that is not in the shoe
    const c = this.cards[this.i++]; this.running += hiLo(c); this.dealt++;
    return c;
  }
  left() { return this.cards.length - this.i; }
  trueCount() { return this.running / Math.max(0.5, this.left() / 52); }
  // what is still in the shoe, by rank (for the checks: the shoe is a real 52 x N)
  census() { const n = {}; for (const c of this.cards) { const r = c.slice(0, -1); n[r] = (n[r] ?? 0) + 1; } return n; }
}

// A hand's total: the best total at or under 21 (an ace counts 1 when 11 would bust); soft if an ace still counts 11.
export function total(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { const v = cardValue(c); t += v; if (v === 11) aces++; }
  while (t > 21 && aces) { t -= 10; aces--; }
  return { t, soft: aces > 0 };
}
export const isNatural = (cards) => cards.length === 2 && total(cards).t === 21;

export class Blackjack {
  // rule: { decks, pen, dealerHitsSoft17, bjPays, doubleAny, splitMax, splitAcesOneCard }
  constructor(rule, shoe) {
    this.rule = rule; this.shoe = shoe;
    this.phase = 'bet'; // bet -> play -> done
    this.hands = []; this.dealer = []; this.active = 0; this.log = [];
  }
  // Deal a round for one seat with `bet` already taken from the player. Reshuffles at the cut card BEFORE dealing.
  deal(bet) {
    if (this.phase === 'play') return { ok: false, why: 'a hand is already out' };
    if (this.shoe.needsShuffle()) { this.shoe.shuffle(); this.log.push('shuffle'); }
    const s = this.shoe;
    this.hands = [{ cards: [], bet, doubled: false, done: false, split: false, result: null }];
    this.dealer = [];
    this.hands[0].cards.push(s.draw()); this.dealer.push(s.draw()); this.hands[0].cards.push(s.draw()); this.dealer.push(s.draw());
    this.active = 0; this.phase = 'play';
    // the dealer peeks with an ace or a ten up: a dealer natural ends the round at once
    const pBJ = isNatural(this.hands[0].cards), dBJ = isNatural(this.dealer);
    if (pBJ || dBJ) { this.hands[0].done = true; return this.finish(); }
    return { ok: true };
  }
  hand() { return this.hands[this.active]; }
  canDouble() { const h = this.hand(); return this.phase === 'play' && h && h.cards.length === 2 && !h.done && (this.rule.doubleAny || [9, 10, 11].includes(total(h.cards).t)) && !(h.split && h.aces && this.rule.splitAcesOneCard); }
  canSplit() {
    const h = this.hand(); if (this.phase !== 'play' || !h || h.cards.length !== 2 || h.done) return false;
    return this.hands.length - 1 < this.rule.splitMax && cardValue(h.cards[0]) === cardValue(h.cards[1]);
  }
  hit() {
    const h = this.hand(); if (this.phase !== 'play' || !h || h.done) return { ok: false, why: 'no hand to hit' };
    h.cards.push(this.shoe.draw());
    if (total(h.cards).t >= 21) h.done = true;
    return this.advance();
  }
  stand() { const h = this.hand(); if (this.phase !== 'play' || !h) return { ok: false, why: 'no hand' }; h.done = true; return this.advance(); }
  // extra: the second bet the table took out of the player's pocket for a double or a split (the same as the first)
  double() {
    if (!this.canDouble()) return { ok: false, why: 'you can double only on your first two cards' };
    const h = this.hand(); h.bet *= 2; h.doubled = true; h.cards.push(this.shoe.draw()); h.done = true;
    return this.advance();
  }
  split() {
    if (!this.canSplit()) return { ok: false, why: 'only a pair splits (and only so many times)' };
    const h = this.hand(), aces = cardValue(h.cards[0]) === 11;
    const h2 = { cards: [h.cards.pop()], bet: h.bet, doubled: false, done: false, split: true, aces, result: null };
    h.split = true; h.aces = aces;
    h.cards.push(this.shoe.draw()); h2.cards.push(this.shoe.draw());
    this.hands.splice(this.active + 1, 0, h2);
    if (aces && this.rule.splitAcesOneCard) { h.done = true; h2.done = true; }
    else if (total(h.cards).t === 21) h.done = true;
    return this.advance();
  }
  advance() {
    while (this.active < this.hands.length && this.hands[this.active].done) this.active++;
    if (this.active >= this.hands.length) return this.finish();
    const h = this.hands[this.active];
    if (h.cards.length === 1) { h.cards.push(this.shoe.draw()); if (total(h.cards).t === 21) { h.done = true; return this.advance(); } } // the second hand of a split gets its card when its turn comes
    return { ok: true };
  }
  // The dealer's turn and the settle. Every hand's result and what it pays back (bet + win), so the house moves by
  // exactly (bets in) - (paid back).
  dealerPlays() {
    const s = this.shoe, R = this.rule;
    const live = this.hands.some((h) => total(h.cards).t <= 21 && !(isNatural(h.cards) && !h.split));
    if (!live) return;
    for (;;) {
      const { t, soft } = total(this.dealer);
      if (t < 17 || (t === 17 && soft && R.dealerHitsSoft17)) this.dealer.push(s.draw()); else break;
    }
  }
  finish() {
    if (!isNatural(this.dealer)) this.dealerPlays();
    const d = total(this.dealer).t, dBJ = isNatural(this.dealer);
    let paid = 0, staked = 0;
    for (const h of this.hands) {
      staked += h.bet;
      const p = total(h.cards).t, nat = isNatural(h.cards) && !h.split && this.hands.length === 1;
      let back = 0;
      if (nat && !dBJ) { h.result = 'blackjack'; back = h.bet + h.bet * this.rule.bjPays; }
      else if (nat && dBJ) { h.result = 'push'; back = h.bet; }
      else if (dBJ) { h.result = 'lose'; back = 0; }
      else if (p > 21) { h.result = 'bust'; back = 0; }
      else if (d > 21 || p > d) { h.result = 'win'; back = h.bet * 2; }
      else if (p === d) { h.result = 'push'; back = h.bet; }
      else { h.result = 'lose'; back = 0; }
      h.back = back; paid += back;
    }
    this.phase = 'done';
    return { ok: true, done: true, staked, paid, net: paid - staked, dealer: d, dealerBJ: dBJ };
  }
  view() {
    const hide = this.phase === 'play';
    return { phase: this.phase, active: this.active,
      dealer: hide ? [this.dealer[0], '??'] : this.dealer.slice(), dealerTotal: hide ? null : total(this.dealer).t,
      hands: this.hands.map((h) => ({ cards: h.cards.slice(), total: total(h.cards).t, soft: total(h.cards).soft, bet: h.bet, doubled: h.doubled, done: h.done, result: h.result, back: h.back ?? null })),
      canDouble: this.canDouble(), canSplit: this.canSplit(), shoe: { decks: this.shoe.decks, left: this.shoe.left(), running: this.shoe.running } };
  }
}
