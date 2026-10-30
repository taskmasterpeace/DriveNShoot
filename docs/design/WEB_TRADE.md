# WEB_TRADE — buying and selling over a trader's own counter (web engine)

**Status:** v1 SHIPPED 2026-10-22 in `web/`: `web/src/data/trade.js` (who trades, in what, the price tiers),
`web/src/systems/trade.js` (the counter), the PACK screen's counter mode (`web/src/ui/inventory.js`), agent command
`trade`, selftest "trade: …". Builds on WEB_INVENTORY (containers, owned shop boxes, theft) and WEB_WORLD_MEMORY
(standing tiers, personal memory, the `trade` deed).

## 1. Overview

There is no shop menu. A trader's stock is the shelves and crates of their own shop, the same containers
`inventory.placeFurniture` already made theirs. When the trader is alive, on their feet, within reach of the shelf
and willing, the PACK screen opened on one of their boxes is a **counter**: taking is buying, putting is selling, and
every row shows its price. Prices come from what a thing is worth (its value, less wear, use and age) times a
multiplier set by how the trader's people stand with you. When the trader is not there, nothing changed from before:
taking is stealing.

## 2. Player fantasy

You walk into Ike's with a dead raider's SMG on your back, worn to 40%, and a pocket full of loose rifle rounds. He
gives you a junk price for the SMG and a fair one for the rounds, and you leave with a cleaning kit and a box of
shells. Six weeks of doing right by Rust Haven later, the same kit costs you less and the rounds fetch more. The night
you shot a drifter in the street, nobody in town would sell you a bottle of water. And the night Ike was out back,
you could have walked off with the whole crate, and the town would have known.

## 3. Detailed rules

- **Traders** (`TRADERS`, by named-person id): Ike (gunsmith: buys guns, rounds, tools), Doc Reyes (clinic: meds),
  Kenji (mechanic: parts, tools, packs), Mags (water trader: water, food, valuables, paper). Each sells whatever is on
  their own shelves; each buys only what they deal in.
- **The counter is live** when, for the box on the other side of the PACK screen: it has an owner; the owner is a
  trader; they are alive, not downed and **not asleep** (WEB_SURVIVAL: the town sleeps 22:00–06:00); they are within `TRADE.reach` (9 m) of you. Otherwise there is no counter.
- **Willing:** the tier of the trader's people with you (`data/society.js` tiers) must have a price row (`hostile`
  and `hunted` have none), and the trader must not personally refuse you (`memory.refuses`, the same rule that ends a
  conversation). Unwilling: the header reads "<NAME> WON'T DEAL WITH YOU: TAKING IS STEALING", and taking is theft.
- **Buying** (Space on their side): as many of the stack as fit in your pockets and as you can pay for, at the stack
  price; cash comes off; no theft is recorded. A gun of a kind you carry none of is slung straight into your hands
  (`inventory.sling`, paid). E on their side buys one and uses it (or slings a gun).
- **Selling** (Space on your side): the whole stack, if they deal in that kind and it is worth at least a dollar to
  them; it goes on their shelf (if it has room) and the cash comes to you. Space on a slung gun sells it (the last gun
  stays on you, as ever).
- **Not yours to drop:** X on their side at a live counter is refused ("THAT'S IKE'S · SPACE BUYS IT").
- **Theft hole closed:** taking from an owned box to anywhere that is not theirs (your pack, your trunk, the floor)
  is theft unless paid for. Dropping a shelf's goods on the floor to pick them up later no longer launders them.
- **Standing grows by dealing:** a deal records one `trade` deed with the trader per `TRADE.deedEvery` (30 s) of
  dealing, so a regular warms the town without a sale-by-sale grind.
- **Restock:** on the first look at a trader's box on a new game day, a box holding fewer than `TRADE.restock` (3)
  things gets another roll of its table, seeded by the day (a save sees the same goods).
- **Ike's shelves** use the `gunsmith` table: rounds of every kind, cleaning kits, the odd second-hand pistol or SMG
  (45–95%, empty), a wrench, tape. **Keeps** (`TRADERS.ike.keeps`): on the first look each day his shelves are topped
  up to 24 pistol, 60 SMG, 8 shells, 30 rifle rounds and a cleaning kit, so the gunsmith never runs dry of rounds.
- **One stock, one price (his dialogue):** Ike's talk offers the first six things on his counter today (`trade.stock`:
  guns first, then rounds), named, a gun with its condition, at the exact `buyPrice` the PACK screen shows, and buys
  them through the same `trade.buy`. He never offers a gun his shelves do not hold. "Let me see the counter." opens his
  counter on the PACK screen (`trade.openCounter`), and it stays open anywhere within his 9 m reach.
- **The screen:** the other side's header reads "<SHELF> · <NAME>'S COUNTER · <TIER> PRICES" in green; their rows show
  the stack price in gold; your rows show what they would pay in green, or dim when they would not buy it; the move
  button reads BUY $n / SELL +$n / <NAME> WON'T BUY IT; the detail line reads "Ike sells all 42 for $17" or "Ike pays
  $5 for all 36".
- **Roles:** if the role system offers `g.roles.priceMul(fid, trader)`, buy prices are multiplied by it and sell
  prices divided by it (a known trader, a quartermaster's friend). Shipped (docs/design/WEB_ROLES.md §4.6): the town's
  four traders are Rust Haven people, so a role's `rusthaven` price is theirs; a role refusal (`g.roles.refusal(c)`,
  a known butcher at Ike's) closes the counter like a grudge; every deal signals the trader role.

## 4. Formulas

| Name | Formula | Variables and ranges | Example |
|---|---|---|---|
| Worth (one) | `value · gunF · useF · freshF` | gunF = `0.25 + 0.75·cond` (cond 0–1); useF = `0.3 + 0.7·left/uses`; freshF: fresh 1, stale 0.5, rotten 0.1 | SMG at 40%: 220·0.55 = $121 |
| Buy price | `max(1, ceil(worth · n · buy))` | buy 1.0–1.6 by tier | 42 SMG rounds ($0.30) at neutral 1.3: ceil(16.38) = $17 |
| Sell price | `floor(worth · n · sell)` | sell 0.25–0.6 by tier | that SMG at neutral 0.4: $48 |
| Affordable count | `k = min(n, room/bulk, floor(cash / (worth · buy)))` | ceil(x) ≤ cash exactly when x ≤ cash | $10 for rounds at $0.39: 25 rounds |
| Tier multipliers | wary 1.6 / 0.25 · neutral 1.3 / 0.4 · friendly 1.15 / 0.5 · allied 1.0 / 0.6 | buy / sell | the spread narrows from 6.4× to 1.7× |
| With a role | buy · m, sell / m | m = `g.roles.priceMul` (1 if none) | m 0.9: neutral buys at 1.17 |

## 5. Edge cases

- **The trader walks out** with the screen open: the next render shows no counter (theft rules); a buy in flight is
  not possible (every buy re-checks `trade.at`).
- **The trader dies or is downed:** no counter; their shelves are stealable (and the dead cannot witness).
- **Not enough cash for the whole stack:** you buy as many as you can pay for; with not enough for one, "NOT ENOUGH
  CASH".
- **No room on you:** as many as fit; none: "NO ROOM ON YOU". A gun you carry none of needs no room (it is slung).
- **No room on their shelf:** the sale is refused ("NO ROOM ON IKE'S SHELF"); nothing moves, no cash.
- **Worth nothing to them** (a dry rag, rotten food): refused, never sold for $0.
- **Partial sale** (their shelf takes only part of a stack): paid for what moved.
- **Hostile people, friendly trader:** the tier decides; personal memory can only refuse on top of it.
- **A trader with several boxes** (shelves and crates): each is its own counter; you browse them.
- **Saves:** stock is saved with the boxes (touched boxes only); the day a box was last stocked is not, so the first
  look after a load never restocks.

## 6. Dependencies

- `web/src/systems/inventory.js`: owned boxes (`placeFurniture`), `move(…, paid)`, `sling(…, paid)`, `stowGun`,
  `roll` (restock, second-hand guns), `freshness` (worth). Its doc (WEB_INVENTORY) points here for trade.
- `web/src/systems/factions.js` / `data/society.js`: tiers (`F.tiers[c.fi]`). `web/src/systems/memory.js`:
  `refuses(c)`. `web/src/systems/deeds.js`: `direct('trade', c)`. WEB_WORLD_MEMORY names `trade` as a verb.
- `web/src/ui/inventory.js`: the counter mode. `web/src/ui/hud.css`: `.trade`, `.price`, `.no-deal`.
- `web/src/main.js`: constructs `g.trade`. `web/src/agent/api.js`: the `trade` command and the selftest check.
- The role system (WEB_ROLES): `g.roles.priceMul(fid, trader)` and `g.roles.refusal(c)`; `deal()` calls
  `g.roles.signal('trade', { faction, value, sell })`.

## 7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| PRICE_TIER.*.buy | data/trade.js | 1.0–1.6 | 0.9–2.5 | what goods cost you by standing |
| PRICE_TIER.*.sell | data/trade.js | 0.25–0.6 | 0.1–0.8 | what your loot fetches (keep < buy or you print money) |
| TRADERS.*.deals | data/trade.js | per trader | kinds or ids | who buys what you carry |
| TRADE.reach | data/trade.js | 9 m | 5–15 | how far the trader can stand from a shelf |
| TRADE.restock | data/trade.js | 3 | 1–6 | how bare a shelf gets before a new day refills it |
| TRADE.deedEvery | data/trade.js | 30 s | 10–120 | how fast dealing warms the town |
| item value | data/items.js | per row | — | the economy's base prices |
| LOOT.gunsmith | data/items.js | rows | — | Ike's stock |

## 8. Acceptance criteria (selftest)

1. At Ike's shelf with Ike 3 m away and his people neutral: the counter is live (tier neutral). Buying 12 of 30 pistol
   rounds costs `ceil(0.4 · 12 · buy)`, takes exactly that cash, leaves 18 on the shelf and 12 more in your pockets,
   and records no theft (`box.stolen` unchanged).
2. Ike refuses a photograph (not his trade); buys a wrench for `floor(15 · sell)`, the cash arrives, the wrench is on
   his shelf.
3. His people at −60 (hostile): he is there but `refuse` is set.
4. Ike 30 m away: no counter (`trade.at` is null).
5. Ike's dialogue with one worn Rust-9 on his counter: every priced offer is a thing on his shelves at its counter
   `buyPrice`; the Rust-9 shows 60%; no Sawn-off is offered; his keeps put 24 pistol rounds out. Buying the rounds there
   takes the price and leaves none on the shelf; "Let me see the counter." closes the talk and opens the PACK screen
   on his box.


## Dependents added by WEB_FARMING (2026-10-29)
- WEB_FARMING.md: garden food reaches a shelf only as a `producer` delivery sent by `garden action=consign`.
