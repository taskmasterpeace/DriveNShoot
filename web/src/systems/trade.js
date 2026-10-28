import { ITEMS, GUN_ITEM } from '../data/items.js';
import { TRADERS, PRICE_TIER, TRADE } from '../data/trade.js';

// Buying and selling at a trader's own shelves (docs/design/WEB_TRADE.md). inventory.placeFurniture makes a
// shopkeeper the owner of their shop's boxes. With that keeper alive, near and willing, the PACK screen opened on one
// of those boxes is a counter: taking is buying, putting is selling (only what they deal in). With them gone, taking
// is stealing, as it always was.
export class Trade {
  constructor(game) { this.g = game; }

  // The deal at a box: null when there is none (not a trader's box, or the trader is not there), else
  // { c, id, name, deals, tier, refuse, buy, sell }. refuse: they are there but will not deal with you.
  at(box) {
    if (!box?.owner) return null;
    const g = this.g, c = g.chars.find((x) => x.id === box.owner), row = c?.npc && TRADERS[c.npc.id];
    if (!row || !c.alive || c.downedT > 0 || c.sleeping) return null; // asleep: no counter (and no witness, deeds.js)
    if (Math.hypot(c.x - g.player.x, c.z - g.player.z) > TRADE.reach) return null;
    const F = g.society?.factions, tier = F && c.fi >= 0 ? F.tiers[c.fi] : 'neutral', T = PRICE_TIER[tier];
    // ...or what you are known for closes the counter (docs/design/WEB_ROLES.md: a known butcher at Ike's).
    // ...and a gun raised in their shop shuts it until it goes down (systems/arms.js: they noticed it).
    const refuse = !T || !!g.society?.memory?.refuses(c) || !!g.roles?.refusal?.(c) || !!g.arms?.refuses(c);
    const mul = (g.roles?.priceMul?.(c.fid, c) ?? 1) * (g.sheet?.fx.priceMul ?? 1) * (g.deep?.fx.priceMul ?? 1); // the deep sheet: Charm, Barter, perks (systems/stats.js); a role that buys cheaper (a known trader, a Remnant quartermaster's friend); a silver tongue or a sour face (data/creator.js)
    this.restock(box);
    return { c, id: c.npc.id, name: row.name, deals: row.deals, tier, refuse, buy: T ? T.buy * mul : 0, sell: T ? T.sell / mul : 0 };
  }

  // Is this box's keeper at their counter (alive, awake, within reach)? The PACK screen keeps a counter opened from a
  // talk while this holds, wherever in the shop you stand (no allocation: it runs every frame the screen is open).
  keeperAt(box) {
    if (!box?.owner) return false;
    const g = this.g, c = g.chars.find((x) => x.id === box.owner);
    return !!(c?.npc && TRADERS[c.npc.id] && c.alive && !(c.downedT > 0) && !c.sleeping && Math.hypot(c.x - g.player.x, c.z - g.player.z) <= TRADE.reach);
  }

  // A trader's whole counter today: every box they own, rolled, restocked and topped up (keeps), as [{ box, i, s }],
  // guns first, then rounds, then the rest. The one list their dialogue offers from and the PACK screen shows.
  stock(c) {
    const inv = this.g.inventory, boxes = [], out = [];
    for (const b of inv.boxes.values()) if (b.owner === c.id) boxes.push(b);
    for (const b of boxes) { if (!b.rolled) { inv.roll(b); b.rolled = true; } this.restock(b); }
    this.keep(c, boxes);
    for (const b of boxes) b.slots.forEach((s, i) => out.push({ box: b, i, s }));
    const rank = (s) => { const k = ITEMS[s.id]?.kind; return k === 'gun' ? 0 : k === 'ammo' ? 1 : 2; };
    return out.sort((a, b) => rank(a.s) - rank(b.s));
  }

  // What a trader never lets run out (TRADERS[id].keeps): on the first look each day, each kept thing is topped up to
  // its count across their shelves, into the first box with room.
  keep(c, boxes) {
    const row = TRADERS[c.npc?.id], day = this.g.society?.day ?? 0;
    if (!row?.keeps || c.keptDay === day || !boxes.length) return;
    // The loot law (data/rites.js LOOT_LAW): the opening stock once; after that only what a delivery brought.
    if (c.keptDay !== undefined && TRADE.law !== 'mint') { c.keptDay = day; this.delivered(c.npc.id, boxes); return; }
    c.keptDay = day;
    for (const [id, n] of row.keeps) {
      let have = 0;
      for (const b of boxes) have += b.count(id);
      for (const b of boxes) { if (have >= n) break; have += this.g.inventory.add(b, id, n - have); }
    }
  }

  // The best (the nearest) of a trader's boxes to open as their counter, rolled and stocked: null with none.
  counterOf(c) {
    const p = this.g.player;
    let best = null, bd = Infinity;
    for (const e of this.stock(c)) { const d = Math.hypot(e.box.x - p.x, e.box.z - p.z); if (d < bd) { bd = d; best = e.box; } }
    if (!best) for (const b of this.g.inventory.boxes.values()) if (b.owner === c.id) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }

  // Open a trader's counter on the PACK screen (their dialogue's "let me see the counter"): ok false with why when
  // there is no counter to open.
  openCounter(c) {
    const g = this.g, box = c && this.counterOf(c);
    if (!box) return { ok: false, why: 'no counter here' };
    const D = this.at(box);
    if (!D) return { ok: false, why: `${TRADERS[c.npc?.id]?.name ?? 'they'} is not at the counter` };
    if (g.invUI?.open) g.invUI.toggle(false); // closing it lets go of whatever it had open
    g.inventory.open(box);
    g.invUI?.toggle(true);
    return { ok: true, box: box.id };
  }

  // Buy a counter entry ({ box, i, s } from stock()) whole: the whole stack of rounds, one gun.
  buyEntry(c, e) {
    const D = this.at(e.box);
    if (!D || D.refuse) return { ok: false, why: 'no deal' };
    const r = this.buy(e.box, e.i, e.s.n, D);
    if (r.ok) this.g.hud?.toast?.(r.text, 'job');
    return r;
  }
  // The price a counter entry is offered at in their dialogue: the same buyPrice the PACK screen shows.
  entryPrice(e) { const D = this.at(e.box); return D && !D.refuse ? this.buyPrice(e.s, ITEMS[e.s.id]?.kind === 'gun' ? 1 : e.s.n, D) : null; }

  // What one of a slot is worth: its value, less for wear (a gun's condition), use (a part-empty bottle) and age.
  worth(s) {
    const it = ITEMS[s.id];
    if (!it) return 0;
    let v = it.value;
    if (it.kind === 'gun') v *= 0.25 + 0.75 * (s.cond ?? 1);
    if (it.uses) v *= 0.3 + 0.7 * ((s.left ?? it.uses) / it.uses);
    const f = this.g.inventory.freshness(s);
    if (f === 'stale') v *= 0.5; else if (f === 'rotten') v *= 0.1;
    return v;
  }
  buyPrice(s, n, D) { return Math.max(1, Math.ceil(this.worth(s) * n * D.buy - 1e-9)); }
  sellPrice(s, n, D) { return Math.floor(this.worth(s) * n * D.sell + 1e-9); }
  deals(D, id) { const it = ITEMS[id]; return !!it && (D.deals.includes(it.kind) || D.deals.includes(id)); }

  // Buy up to n of slot i of a trader's box: as many as fit on you and you can pay for. A gun you carry none of is
  // slung, not packed.
  buy(box, i, n, D) {
    const g = this.g, inv = g.inventory, s = box.slots[i], it = s && ITEMS[s.id];
    if (!it || !D || D.refuse) return { ok: false, why: 'no deal' };
    const unit = this.worth(s) * D.buy;
    if (it.kind === 'gun' && !g.inv.weapons.includes(it.weapon)) {
      const cost = this.buyPrice(s, 1, D);
      if (cost > g.cash) return { ok: false, why: 'not enough cash' };
      const r = inv.sling(box, i, true);
      if (!r.ok) return r;
      g.cash -= cost; this.deal(D, 'buy', s.id, 1, cost);
      return { ok: true, n: 1, cost, text: `BOUGHT · ${r.text} · $${cost}` };
    }
    let k = Math.min(n, s.n, it.bulk > 0 ? Math.floor((inv.room(inv.carried) + 1e-6) / it.bulk) : n);
    if (k <= 0) return { ok: false, why: 'no room on you' };
    if (unit > 0) k = Math.min(k, Math.floor((g.cash + 1e-9) / unit)); // ceil(unit·k) <= cash exactly when unit·k <= cash
    if (k <= 0 || this.buyPrice(s, k, D) > g.cash) return { ok: false, why: 'not enough cash' };
    const cost = this.buyPrice(s, k, D), id = s.id;
    const got = inv.move(box, i, inv.carried, k, true);
    g.cash -= cost; this.deal(D, 'buy', id, got, cost);
    return { ok: true, n: got, cost, text: `BOUGHT ${got > 1 ? `${got} ` : ''}${it.name.toUpperCase()} · $${cost}` };
  }

  // Sell up to n of slot i of your pockets into the trader's box (only what they deal in, only what is worth a dollar).
  sell(i, box, n, D) {
    const g = this.g, inv = g.inventory, s = inv.carried.slots[i], it = s && ITEMS[s.id];
    if (!it || !D || D.refuse) return { ok: false, why: 'no deal' };
    if (!this.deals(D, s.id)) return { ok: false, why: `${D.name} doesn't deal in that` };
    const k = Math.min(n, s.n), id = s.id, per = this.worth(s);
    if (this.sellPrice(s, k, D) <= 0) return { ok: false, why: `it's worth nothing to ${D.name}` };
    const sold = inv.move(inv.carried, i, box, k);
    if (!sold) return { ok: false, why: `no room on ${D.name}'s shelf` };
    const pay = Math.floor(per * sold * D.sell + 1e-9);
    g.cash += pay; this.deal(D, 'sell', id, sold, pay);
    return { ok: true, n: sold, pay, text: `SOLD ${sold > 1 ? `${sold} ` : ''}${it.name.toUpperCase()} · +$${pay}` };
  }

  // Sell a gun slung on you (it goes on the shelf with its condition and rounds).
  sellGun(k, box, D) {
    const g = this.g, inv = g.inventory, id = GUN_ITEM[k];
    if (!D || D.refuse) return { ok: false, why: 'no deal' };
    if (!this.deals(D, id)) return { ok: false, why: `${D.name} doesn't deal in guns` };
    const pay = this.sellPrice({ id, n: 1, cond: inv.cond(k) }, 1, D);
    const r = inv.stowGun(k, box);
    if (!r.ok) return r;
    g.cash += pay; this.deal(D, 'sell', id, 1, pay);
    return { ok: true, pay, text: `SOLD THE ${ITEMS[id].name.toUpperCase()} · +$${pay}` };
  }

  // A deal struck: one `trade` deed per trader per deedEvery seconds (their people warm to a regular).
  deal(D, side, id, n, cash) {
    const g = this.g, c = D.c;
    if ((c.tradeDeedT ?? -1e9) < g.time - TRADE.deedEvery) { c.tradeDeedT = g.time; g.society?.deeds?.direct('trade', c); }
    g.roles?.signal?.('trade', { faction: c.fid, value: cash, sell: side === 'sell' }); // scrip changing hands: the trader's role
    g.inventory.changed();
    g.audio?.blip?.();
    g.emit('trade', { trader: D.id, side, item: id, n, cash, tier: D.tier });
  }

  // Goods that came in by a visible source (a courier, a caravan, a producing building: g.rites.deliver) go on the
  // trader's shelves, the first of their boxes with room.
  delivered(trader, boxes) {
    const R = this.g.rites;
    for (let d = R?.takeDelivery(trader); d; d = R.takeDelivery(trader)) {
      for (const s of d.items) for (const b of boxes) { const n = this.g.inventory.add(b, s.id, s.n, s); if (n >= s.n) break; s.n -= n; }
      this.g.emit('restocked', { trader, from: d.source.kind, items: d.items.length });
    }
  }

  // Shelves fill again overnight: on the first look on a new day, a box holding fewer than TRADE.restock things gets
  // another roll of its table (seeded by the day, so a save sees the same goods).
  restock(box) {
    const day = this.g.society?.day ?? 0;
    if (!box.rolled || box.stockDay === day) return;
    const seen = box.stockDay !== undefined;
    box.stockDay = day;
    if (!seen || box.slots.length >= TRADE.restock) return;
    if (TRADE.law !== 'mint') return; // no regeneration: goods come in by delivery (keep -> delivered), never from the table again
    const seed = box.seed;
    box.seed = (seed ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0;
    this.g.inventory.roll(box);
    box.seed = seed;
    this.g.emit('restocked', { box: box.id, day });
  }
}
