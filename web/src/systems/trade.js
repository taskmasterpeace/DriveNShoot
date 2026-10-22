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
    if (!row || !c.alive || c.downedT > 0) return null;
    if (Math.hypot(c.x - g.player.x, c.z - g.player.z) > TRADE.reach) return null;
    const F = g.society?.factions, tier = F && c.fi >= 0 ? F.tiers[c.fi] : 'neutral', T = PRICE_TIER[tier];
    const refuse = !T || !!g.society?.memory?.refuses(c);
    const mul = g.roles?.priceMul?.(c.fid, c) ?? 1; // a role that buys cheaper (a known trader, a Remnant quartermaster's friend)
    this.restock(box);
    return { c, id: c.npc.id, name: row.name, deals: row.deals, tier, refuse, buy: T ? T.buy * mul : 0, sell: T ? T.sell / mul : 0 };
  }

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
    g.inventory.changed();
    g.audio?.blip?.();
    g.emit('trade', { trader: D.id, side, item: id, n, cash, tier: D.tier });
  }

  // Shelves fill again overnight: on the first look on a new day, a box holding fewer than TRADE.restock things gets
  // another roll of its table (seeded by the day, so a save sees the same goods).
  restock(box) {
    const day = this.g.society?.day ?? 0;
    if (!box.rolled || box.stockDay === day) return;
    const seen = box.stockDay !== undefined;
    box.stockDay = day;
    if (!seen || box.slots.length >= TRADE.restock) return;
    const seed = box.seed;
    box.seed = (seed ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0;
    this.g.inventory.roll(box);
    box.seed = seed;
    this.g.emit('restocked', { box: box.id, day });
  }
}
