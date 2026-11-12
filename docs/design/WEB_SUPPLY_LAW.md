# WEB_SUPPLY_LAW: the crew make nothing from nothing, and the stock ledger proves it

Branch `fix/web-supply-law` (2026-11-12), cut from `prep/g0-wave2`, which already holds the farming, crafting,
seasons and gadgets lanes. Robert, 11-12, on the audit's three crew leaks: "yeah, fix that".
Laws served: no cheating, no loot regeneration (WEB_DEPTH_PLAN law 2), facts carry a source, G0(d) (the stock ledger
and the cheat audit), WEB_LIVING_WORLD_GOAL T8 (world stock may rise only by a traced amount each hour).

## 1. Overview

The 11-12 audit of `integrate/deathlands` found three crew jobs that made goods out of thin air:

| Job | On integrate | Now |
|---|---|---|
| FARM | a ration every 12 game hours, no inputs | **TEND THE GARDEN** works the farming lane's real beds: seed, water and days (`systems/farming.js crewTend`, merged on wave2). Every pick is now stamped `harvest`. |
| SCAVENGE RUN | rolled a private `crew_run` loot table off-screen | **this branch:** opens the real unopened boxes nearest the base, each rolled once like any box. The town stays stripped, and with nothing in reach the run comes back empty. |
| CRAFT AMMO | 1 scrap made 8 pistol rounds, more with skill | the crafting lane's `load_pistol` row: 8 brass, 8 primers, 1 powder and 1 lead make 8 rounds (`systems/crafting.js crewRun`, merged on wave2). Every round is now stamped `recipe`. |

What this branch adds on top of wave2:

1. **The real scavenge run.** The `CREW_RUN_LOOT` table is deleted, along with the farming lane's seed push into it.
2. **The stock ledger** (`web/src/systems/stockLedger.js`): every gain is stamped with its origin, and a census once a
   game hour flags any gain that isn't traced.
3. **The cheat audit:** battery checks `supply law: ...` (`web/src/agent/supply-api.js`). Each crew job runs inside a
   ledger window, and any gain that doesn't trace to an allowed origin fails the check by name.
4. **All-or-none job inputs.** The old `takeItem` accepted a partial stack as a whole one.
5. **A trader's opening stock is once per world.** It used to come back after every load, because `keptDay` lived
   only on the page.

## 2. Player Fantasy

Your crew are people working with what the base has. The gunsmith loads rounds from the brass you brought back from
Ike's shop. The cook waters the rows from the bucket you filled at the river. The scavenger walks to the houses up the
street, and after a few runs those houses are empty, so the next run has to go further or comes back with nothing.
What the base produces depends on what you feed it.

## 3. Detailed Rules

- **The pool.** A job with `inputs` draws them from your pack first, then the crew stash at the base. It takes all of
  them or none. When something is short, the member names what's missing and the job waits (`crewJobShort` event).
  Recipe jobs use the crafting lane's own pool and its all-or-none check.
- **SCAVENGE RUN** (`systems/supply.js runTargets / haul`; rows in `data/supply.js CREW_RUN`).
  - When the run starts, it picks up to 3 boxes that have never been opened, within `reach` x the skill multiplier of
    the base, nearest first.
  - It skips owned boxes (a keeper's shelf would be theft), unseen boxes, boxes upstairs (`y > 0.5`), the dead, graves,
    the ground, home boxes and your stash.
  - It opens them at once through `Inventory.roll`, the same once-only seeded roll the player gets, stamped `roll`.
  - When the run returns, the runner carries home up to 30 litres, most valuable per litre first. Whatever doesn't fit
    stays in the opened box.
  - With nothing unopened in reach, the runner comes back empty-handed and says so (`crewRunBack.empty`).
  - The risk roll (hurt, or lost) is unchanged.
- **The stock ledger.**
  - **Stamps:** `ledger.stamp(item, n, origin, src)`. The allowed origins:

    | Origin | What it covers |
    |---|---|
    | `roll` | a box's first roll |
    | `body` | a dead person's own gun, rounds and pockets |
    | `opening` | a trader's opening stock, once per world |
    | `delivery` | goods a delivery brought |
    | `recipe` | crafting, cooking, compost, the drying rack, the crew's ammo |
    | `harvest` | garden picks and saved seed, eggs, butchering |
    | `forage` | picking, fishing, traps |
    | `salvage` | stripping a wreck or a structure that exists |
    | `start` | a new character's starting kit |
    | `crew_kit` | a crew member's own belt and gun |

    The forbidden origin is `minted`: `main.js give()` rewards and the old daily trader mint. An origin nobody wrote
    down counts as `minted`.
  - **Census:** once a game hour (`ledger.update()` in `main.js`) it counts every good. That covers your pack, worn
    pack, worn gear, the guns in your hands and the rounds in them, every registered box (shelves, crates, the dead,
    the ground, trunks, the crew stash), ring boxes kept while their chunk is away, dead residents' bodies kept off the
    map, and crew members' rounds.
  - **Flags:** a rise beyond the hour's stamps is an `untraced` flag. Every `minted` stamp is a flag, traced or not.
    Each flag emits a `stockFlag` event.
  - **Moves:** moving a thing between holders changes no count, so it needs no stamp.
  - **Load:** loading a save calls `rebase()`.
- **The cheat audit.** `ledger.audit(fn)` counts everything before and after `fn`, takes the stamps made in between,
  and returns `{ rises, flags, stamps }`. The battery checks require `flags` to be empty for every crew job, and require
  that a deliberate leak IS flagged.
- **Trader opening stock.** `Trade.opened` (saved as `trade` in the save file) lists the traders whose opening stock
  is already out. After that, a trader's shelves fill only from deliveries, however many loads happen.

## 4. Formulas

- **Skill multiplier** (unchanged): `mul = 0.5 + 0.25 x skill`. Cycle game hours = `job.hours / mul`.
- **Ammo:** `load_pistol` gives 8 rounds per cycle. Skill sets the speed, never the yield. Example: a gun tinker
  (gunsmith 4, mul 1.5) runs a 2-hour cycle. With 16 brass, 16 primers, 2 powder and 2 lead in the pack, 24 hours
  make exactly 16 rounds and leave none of the inputs. Battery-checked.
- **Run reach:** `CREW_RUN.reach x mul`. Example: a drifter scavenger (scavenge 4) reaches 260 x 1.5 = 390 m, opens up
  to 3 boxes and carries 30 L.
- **Census:** `untraced(good) = max(0, count_now - count_before - stamps(good))`, per good per hour (or per audit
  window).

## 5. Edge Cases

- **A run's boxes go cold** (the player drove off and the chunk unloaded). Their kept contents (`inv.ringKept`, the
  same array) are hauled anyway. Whatever doesn't fit goes straight back into those kept slots.
- **The player loots a box while the runner is out.** The runner hauls what is left. The box was rolled once, at the
  start of the run.
- **A full pack.** `crew.deliver` puts the rest in the stash when there is a base. Recipe stamps record what was
  actually delivered.
- **A runner lost on the run.** The boxes they opened stay opened, with their contents.
- **A resident's pockets** are rolled off a `tmp:` box when they come home from a run. They aren't stamped as a `roll`.
  They're stamped `body` when the resident lies dead (see the open list for the run itself).
- **Losses mask leaks in the hourly census.** The census judges net rises: a leak of 8 rounds in an hour you fired 20
  doesn't flag. That is why the cheat audit runs jobs in a staged window with nothing consumed. The hourly census
  catches leaks in quiet hours and every `minted` stamp.
- **Paths not yet stamped** flag as `untraced` in normal play, which is the ledger working. See the open list (§9).

## 6. Dependencies

- **Uses:** `systems/inventory.js` (roll, add, take, boxes, ringKept), `systems/trade.js`, `systems/crew.js`,
  `systems/farming.js` (crewTend), `systems/crafting.js` (crewRun), `data/rites.js LOOT_LAW`.
- **Used by:** the battery (`supplyChecks` after `crewChecks`), the `ledger` command, `WEB_CREW.md` §3.5.
- **Shared-file hooks, each one line or a few:**
  - `main.js`: constructs `this.ledger`, calls `ledger.update()` next to `crew.update`, and stamps `give()`'s ammo as
    `minted`.
  - `agent/api.js`: the import, the commands spread, the checks call, `trade` in the save, and `trade.load` plus
    `rebase()` in `restore()`. The Ike counter check now resets `trade.opened` for Ike and restores it.
  - `inventory.js`: `roll()` stamps `roll` (split into `rollRows`, with an origin argument; `tmp:` boxes aren't
    stamped); `armBody()` stamps `body`.
  - `trade.js`: `opened`, `save` and `load`; `keep()` stamps `opening` (or `minted` under the old daily law);
    `delivered()` stamps `delivery`; `restock()` rolls as `minted`.
  - `farming.js`: harvest, crew pick, eggs and slaughter stamped `harvest`; compost stamped `recipe`.
  - `crafting.js`: finish, byproducts and cancel stamped `recipe`.
  - `cooking.js`: stamped `recipe`.
  - `outdoors.js`: forage, trap, fishing and rack stamps.
  - `fauna.js`: butcher and cook stamps.
  - `residents.js`: a dead resident's carry stamped `body`.
  - `data/farming.js` and `agent/farming-api.js`: the seed push into the retired run table removed. The farming
    channel check now requires the table to be gone.

## 7. Tuning Knobs

| Knob | Where | Default | Safe range |
|---|---|---|---|
| `CREW_RUN.reach` | data/supply.js | 260 m | 120-600 (bigger strips more of the map per run) |
| `CREW_RUN.boxes` | data/supply.js | 3 | 1-6 (houses per run) |
| `CREW_RUN.carry` | data/supply.js | 30 L | 15-60 (what one walker brings home) |
| `CREW_RUN.skip` | data/supply.js | body, grave, ground, crew, home | id prefixes ending in `:` |
| ledger `log` / `flags` kept | systems/stockLedger.js | 400 / 200 | memory only |

## 8. Acceptance Criteria

- `node --test web/tools/supply-law.test.mjs`: 6 unit tests:
  - the rows, and the run table being gone
  - `load_pistol` inputs and outputs, and the farm row having no outputs
  - the all-or-none pool
  - run targets and haul
  - census and reconcile
  - the old jobs failing and the new jobs passing the audit on a fake game, plus the hourly flag
- Battery `only=supply law` (5 checks):
  - **rows:** the rows validate; ammo is `load_pistol` with brass, powder, primer and lead; farm and run have no outputs
    of their own; no crew job is on the LOOT_LAW todo list.
  - **ammo:** no inputs makes no rounds and the job says it's short; 16+16+2+2 makes exactly 16 rounds and uses up every
    input, and every stamp is `recipe`.
  - **garden:** no garden makes no food and no flags; a real ripe bed gives exactly `expected()` tomatoes, and every
    stamp is `harvest`.
  - **run:** 3 near boxes are opened and stamped `roll`; the far box stays shut; the second run finds nothing (`empty`,
    searched 0).
  - **the audit itself:** a 50-round unstamped add is flagged `untraced`, a `minted` stamp is flagged, and an hourly
    census flags an unstamped add.
- Battery `only=crew jobs`: the scavenge-run check stages a real box and requires it rolled.
- Battery `only=farming`: the seed channel check requires the run table to be gone.
- Battery `only=trade`: Ike's counter check (its opening stock, with `trade.opened` reset and restored).

## 9. Open list (not fixed here)

- **Residents back from a run** (`systems/residents.js found`) still roll a `finds` table off-screen into their pockets.
  It's the same break as the old crew run. LOOT_LAW now has a `todo` row for it. Fix (medium): the same `runTargets`
  near their home, so a town's own people strip it too.
- **The mechanic's "Refill the guns and droppers"** (`data/npcs.js` -> `garage.refill`). It fills every mount and
  dropper for $40 from nowhere. Mount rounds are numbers on the vehicle, not items, so the ledger can't see this one yet.
  Fix (medium): map each `MOUNT_WEAPONS[].ammo` (`belt_mg`, `belt_50`, `ac_shells`, with `perItem`) and each utility
  charge to an item, draw them from the mechanic's own owned boxes, and charge per unit. This belongs to the COURIER
  lane, since his shelves need deliveries to refill.
- **Content-pack dialogue `give:{ammo,weapon}`** (`agent/api.js` content NPCs, `main.js give`). Rewards are minted.
  This branch stamps them `minted`, so the ledger flags every one. Fix (medium): the reward is drawn from the giver's own
  boxes and the choice greys out when they don't hold it. That needs a content-pack schema change (`give.from`).
- **Skill adds saved seed** in the farming lane (`crewTend` +1 seed at mul > 1.2, `harvest` +1 at farm level 5). A
  plant gives what it gives, so this is a farming-lane call. It's flagged here, not changed.
- **Not yet stamped** (these flag `untraced` at the hourly census in normal play):
  - character creator and clone starting kits (`start`)
  - roadside scrap and siphon hose (`salvage`)
  - casino and bar prizes (`pulls.js`)
  - the caravan stock set into a trunk (`pulls.js`)
  - packing up a camp, gadget and bench pickup, kit (each is an item coming back from a placed thing, so the placed
    thing needs counting as a holder)
  - `longroad.js`
  - dog collars
  - thieves' loot returned (`farming.js`)
  - throwables (`g.inv.throwables` are numbers, not items)

  Each is a one-line stamp or a holder added to `StockLedger.holders()`.
