# WEB_INVENTORY — what you carry, and what the world holds (web engine)

**Status:** phase 1 SHIPPED 2026-10-22 in `web/`: items as rows (`web/src/data/items.js`), the container model
(`web/src/systems/inventory.js`), the PACK screen (`web/src/ui/inventory.js`), V quick-use, searchable bodies,
ground piles, trunks, tools that act on cars. Agent commands `inventory`, `item`, `pack`; selftest "inventory: …" (2).
Phase 2 (below, Open) puts boxes inside buildings, guns and rounds into the item model, and trade.

## 1. Overview

The guns and their rounds stay in `g.inv` (combat reads them every shot). Everything else is an **item** in a
**container**. You carry one list: pockets and belt (3 L) plus the pack on your back (a satchel 8 L, a backpack 22 L,
a frame ruck 45 L). The world holds other containers: the trunk or bed of every vehicle (a bike's saddlebags 22 L, a
van 1 400 L), the bodies of the dead (what they carried, rolled from a seeded table when first searched), ground piles
(whatever was dropped or didn't fit), and, in phase 2, cupboards, lockers and crates in rooms.

Room is litres; weight is kilograms and slows you through the carry system (skills.js). Things have uses (a bottle has
three swallows, a first-aid kit three patch-ups), food spoils on the game clock, and some things need a tool (a tin
needs a blade).

## 2. Player fantasy

You come out of a dead man's pockets with a bottle that's two-thirds full and a photograph of people you'll never meet.
Your satchel is nearly full and the frame ruck you found is heavy enough to stop your sprint. You can't open the beans
without a knife. The bread you bought in Rust Haven on Monday is stale by Wednesday. You pull up next to your car, pour
a can of gas into it and tape the radiator, and you do it in the open with your back to the road, because rummaging
takes your hands and your eyes.

## 3. Detailed rules

- **The list on you** has room `3 L + worn pack litres`. Adding past the room fails (partial for stacks).
- **Stacks:** items with `stack > 1` share slots up to the stack size; food only stacks with food of the same freshness
  (a stack is as old as its oldest). Items with uses are one per slot and carry `left`.
- **Weight:** each slot weighs `kg × n`, or for things with uses `kgEmpty + (kg − kgEmpty) × left/uses`; the worn pack
  adds its own kg. Total weight joins the guns' weight in skills.js (`carryKg` grows with STRENGTH).
- **Using** (E on the PACK screen, or V): food and water change `g.needs` (negative amounts cost you: jerky is salty),
  meds heal and stop bleeding, painkillers ease the shakes, antibiotics cure (for the fever a bite brings, when that
  lands). A thing that needs a tool tag (`blade`) refuses without one you carry. A spent refillable keeps its shell.
- **V, quick-use:** bleeding or under 45% health → the best med (a bleed-stopper first); else the lower of water/food
  under 75%; else a med under 85% health. Food that spoils soonest is eaten first; rotten food is never picked.
- **Freshness:** `spoils` game hours fresh, as long again stale (half the good, half the price), then rotten (15% of
  the good, and 6 damage: it was off).
- **Tools that act:** a fuel can refuels the car you're in or at; a spare tyre swaps the first flat; duct tape patches
  the worst of engine/radiator/tank (+0.25, +0.15 more with a wrench); spark plugs patch an engine (+0.45);
  lockpicks/crowbar hand off to the interiors system's locks (`g.interiors.forceLock`, phase 2 wiring).
- **The PACK screen** (I or Tab; Esc/I/Tab closes): you stand still (a car coasts with no input) and the world keeps
  running. Left: on you. Right, in order: a box or body within 2.6 m, else the vehicle you're in or beside, else the
  ground at your feet. W/S pick, A/D side, E use, Space move across, X drop, F wear a pack; mouse clicks and
  double-clicks do the same.
- **Pickups** (the world's loot boxes): water → a bottle (80%) or a canteen, part-full; food → beans, jerky, peaches,
  a ration, honey, cactus fruit; med → bandage, painkillers, suture kit, first-aid kit. They go in your pack; with no
  room they're left on the ground as a pile. Ammo and cash work as before.
- **The dead:** every human but the player and named people leaves a container (`body:<id>`, 20 L) rolled from
  `person` or `raider` loot when first searched; the oldest empty ones are forgotten past 60.
- **Ground piles** render as one canvas bundle each (one draw call for all, 96 max); an empty pile is pruned when the
  PACK screen closes.

## 4. Formulas

| Name | Formula | Example |
|---|---|---|
| Room on you | `3 + pack` L | backpack: 25 L |
| Slot weight (uses) | `(kgEmpty + (kg − kgEmpty)·left/uses) · n` | canteen 4/6 left: 0.3 + 0.95·0.67 = 0.93 kg |
| Fit | `min(n, floor(room / bulk))` | 2 L free, tins 0.45 L: 4 tins fit |
| Freshness | age < spoils: fresh; < 2·spoils: stale (×0.5); else rotten (×0.15, −6 hp) | flatbread 70 h old: stale |
| Loot roll | `rolls ∈ [lo, hi]`, each roll: empty with weight `none`, else a row by weight, count ∈ [min, max], uses 35–100% left, food up to 1.6·spoils old | raider: 1–3 rolls |
| Repair | `+0.25 (+0.15 wrench)` to the worst of engine/radiator/tank; plugs `+0.45` engine | |

## 5. Edge cases

- **No room for a find:** it stays where it lay, as a ground pile ("· NO ROOM").
- **Swapping to a smaller pack** is refused if what you carry wouldn't fit in it.
- **The other side drives off or you walk away** (more than 3.2 m, or out of reach of the car): the screen falls back to
  what is here now.
- **Dying with the pack open** closes it. Death keeps your things (Doc Reyes takes cash, not your pack).
- **Old saves** without `inventory` load the start kit; trunks are saved by vehicle id and restored onto the same ids.
- **Items a save names that no longer exist** are dropped on load.
- **A body that is recycled** (character budget) keeps its container until the 60-body cap forgets it.

## 6. Dependencies

- `web/src/main.js`: construction, the pickups (`pickItem`), V (`quickUse`), I/Tab, bodies in `onKill`, pack update.
- `web/src/systems/skills.js`: carried weight includes `inventory.kg()`.
- `web/src/systems/survival.js`: needs and pips (items write `g.needs`, then re-pip).
- `web/src/systems/vehicledamage.js`: tyres, engine, radiator, tank, fuel (tools act on them).
- `web/src/systems/stunts.js`: piles sit on ramp/dune height.
- `web/src/ui/qol.js`: Esc leaves the PACK screen to close itself; the pause-menu key list names I and V.
- `web/src/agent/api.js`: `inventory`, `item`, `pack`, save/load, the selftest checks.
- WEB_WORLD_MEMORY: none yet (phase 2: theft from an owned box is a `steal` deed). WEB_FAN_SERVICE_BIBLE §PZ (the
  survival-sim pack) points here.

## 7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| BODY_LITRES | data/items.js | 3 | 2–5 | how much you carry before a pack matters |
| pack litres | ITEMS.*.pack | 8 / 22 / 45 | — | the satchel→ruck ladder |
| uses / amounts | ITEMS.*.use | bottle 3 × 0.16 water | — | how far a bottle goes (a need drains 1/40 per game hour) |
| spoils | ITEMS.*.spoils | bread 48 h, fruit 36 h | 12–200 | how often you must eat fresh or carry tins |
| LOOT rows | data/items.js | per table | — | what a kind of place gives |
| MAX_BODIES | inventory.js | 60 | 30–120 | searchable dead remembered |
| TRUNK litres | inventory.js | per type | — | what a car hauls |
| quick-use thresholds | main.js quickUse | 45% hp / 75% need | — | how eager V is |

## 8. Acceptance criteria (selftest)

1. A water pickup lands in the pack; V drinks from it (water up, the bottle at 2/3); a tin is refused without a blade
   and eaten with a knife; a backpack swaps in for the satchel (room > 20 L, the satchel back in the list).
2. A killed raider leaves a searchable body; searching twice from the same seed gives the same things; carrying 6 kg of
   scrap raises the carried weight by 6 kg.
3. The survival check: thirst fixed by drinking a found bottle with V (pips back to 0).

## Open (phase 2)

Boxes in rooms (kitchen/bathroom/bedroom/garage/office tables) placed from the interiors system's rooms, with a search
time and noise; locked boxes and the lockpick/crowbar wiring; guns and rounds as items (condition, jams); trade (sell
to traders at standing-adjusted prices); a portable radio item that gates STATIC 1660 AM away from cars and the
station; refilling bottles at pumps and the river.
