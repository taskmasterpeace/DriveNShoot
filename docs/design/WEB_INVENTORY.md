# WEB_INVENTORY — what you carry, and what the world holds (web engine)

**Status:** phase 1 and the first half of phase 2 SHIPPED 2026-10-22 in `web/`: items as rows (`web/src/data/items.js`), the container model
(`web/src/systems/inventory.js`), the PACK screen (`web/src/ui/inventory.js`), V quick-use, searchable bodies,
ground piles, trunks, tools that act on cars. Agent commands `inventory`, `item`, `pack`; selftest "inventory: …" (2).
Phase 2 shipped: every crate and shelf inside a building is a container (114 at boot), its loot fitting the place
(a clinic's shelves hold medicine, the mechanic's hold parts, a house has kitchen/bedroom/bathroom things); a named
shopkeeper owns what is in their shop and taking it is a `steal` deed; lockpicks and the crowbar work the interiors
system's locks (hold E at a locked door: picks quietly, a bar loudly; a tap still kicks). Guns and rounds as items
shipped 2026-10-22: rounds are items in your pockets (the gun code reads them through a view), each gun has a
condition that every shot wears, worn guns jam, the dead keep their guns, Ike fixes guns and sells cleaning kits; agent
command `gun`; selftest "rounds are things…", "guns are things…". Still open: trade, the radio item, refills.

## 1. Overview

Everything you carry is an **item** in a **container**, rounds included. The guns slung on you are your **loadout**
(`g.inv.weapons`: holster and sling, outside the list, quick to hand with 1–4); a gun you put down becomes an item that
keeps its condition and the rounds in it. You carry one list: pockets and belt (3 L) plus the pack on your back (a
satchel 8 L, a backpack 22 L, a frame ruck 45 L). The world holds other containers: the trunk or bed of every vehicle (a bike's saddlebags 22 L, a
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

Your revolver was old when you got it. Somewhere past the three-hundredth round it starts to hang: you pull, nothing,
and you work the action with a man coming at you. The soldier you dropped at the wire had a rifle with half a magazine
in it and two more on his belt, and it is the best thing you have ever held. The raider's SMG is junk, but it eats the
rounds you have the most of. Ike will make your gun right again for a price that depends on how badly you treated it.

## 3. Detailed rules

- **The list on you** has room `3 L + worn pack litres`. Adding past the room fails (partial for stacks).
- **Stacks:** items with `stack > 1` share slots up to the stack size; food only stacks with food of the same freshness
  (a stack is as old as its oldest). Items with uses are one per slot and carry `left`.
- **Weight:** each slot weighs `kg × n`, or for things with uses `kgEmpty + (kg − kgEmpty) × left/uses`; the worn pack
  adds its own kg. Total weight joins the guns' weight in skills.js (`carryKg` grows with STRENGTH).
- **Using** (E on the PACK screen, or V): food and water change `g.needs` (negative amounts cost you: jerky is salty),
  meds heal and stop bleeding, painkillers ease the shakes, antibiotics treat BITE FEVER (WEB_SURVIVAL: a full night's
  sleep after them breaks it), a bedroll puts you to sleep where you stand (kept). A thing that needs a tool tag
  (`blade`) refuses without one you carry. A spent refillable keeps its shell.
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
  room they're left on the ground as a pile. An ammo box is rounds for every gun you carry (12 pistol, 32 SMG, 4
  shells, 10 rifle), into your pockets like any rounds. A raider's pocket money still spills as a cash pickup (45%).
- **The dead:** every human but the player and named people leaves a container (`body:<id>`, 20 L) rolled from
  `person`, `raider` or `soldier` loot when first searched; the oldest empty ones are forgotten past 60. The gun the
  dead held is in it (see guns), with spare rounds for it.

### Guns and rounds

- **Rounds are items** (`ammo_pistol`, `ammo_smg`, `ammo_shells`, `ammo_rifle`): they weigh and take room like
  anything else, sit in trunks and on bodies, and can be dropped. The gun code reads and writes them as
  `g.inv.ammo[kind]`, which is a view onto the carried list (`inventory.bindAmmo`): reading counts what you carry;
  adding puts rounds in your pockets (what will not fit goes in the trunk of the car you are in, else on the ground at
  your feet, with a "NO ROOM" toast); taking removes them, newest stacks first. A reload takes rounds out of your
  pockets.
- **The loadout:** the guns slung on you (`g.inv.weapons`) are outside the list. Each has rounds in it
  (`g.inv.mag`), a **condition** (`g.inv.cond`, 1 clean, 0 broken) and may be **jammed** (`g.inv.jam`). Their weight
  (`ITEM_KG.weapon`) and the rounds in them count in skills.js as before.
- **Wear:** every round fired takes `GUN_WEAR[gun].wear` off the condition (the agent's `fire` wears it the same way).
- **Jams:** below `jamBelow` (0.65), each shot may jam the gun (formula below). A jammed gun's trigger goes dead: a
  pull clicks and starts clearing it; R clears it too. Clearing takes `clearTime` × dexterity's reload multiplier and
  throws the stuck round away. The HUD stamps JAMMED · R across the cartridges until it is cleared.
- **Broken** (condition 0): the trigger does nothing ("BROKEN · A GUNSMITH CAN FIX IT", at most every 3 s). A
  cleaning kit refuses a broken gun.
- **Cleaning kit** (5 uses, garages and armories, Ike sells them for $40): one use puts `kit` (0.35) back on the gun in
  your hands, up to `kitMax` (0.95: worn parts need a gunsmith), and clears a jam.
- **The gunsmith** (Ike, Rust Haven): "Fix my <gun>" makes the gun in your hands clean (1.0) for the quote below.
- **The HUD:** a condition gauge on the weapon plate's brass rule (brass ok, amber once it can jam, red jammed or
  broken), its percent beside it; the rifle has its own bottlenecked cartridge in the round count.
- **Gun items** (`gun_pistol`, `gun_smg`, `gun_shotgun`, `gun_rifle`): a slot carries `cond` and `loaded`. On the
  PACK screen the ON YOU side starts with the slung guns (condition, loaded/magazine, JAMMED or BROKEN). E on a slung
  gun takes it in hand; Space puts it on the other side (trunk, body, box, ground); X puts it down. E on a gun item
  anywhere **slings** it: into the loadout if you carry none of its kind (and into your hands), else swapped for yours
  (yours goes where it lay, with its condition and rounds). Space on a gun item on the other side slings it if you
  carry none of its kind, else takes it into the pack as a spare (room permitting).
- **The dead keep their guns:** `armBody` puts the gun a dead person held in their body with a condition, a part-full
  magazine and spare rounds by who they were (`GUN_FOUND`): a raider's gun is junk (18–60%), a Remnant soldier's
  rifle is good (62–95%, 20–60 spare rounds).
- **Buying and gifts:** Ike's guns arrive slung, loaded and at 90%; a dialogue gift or the agent's `give weapon=`
  arrives slung and loaded at 100%; a gun of a kind you already carry arrives as a spare in your pack.
- **Furniture:** every `crate` and `shelf` static inside an enterable building becomes `box:<x10>:<z10>` (ids from
  position, so saves find them again). A shop's boxes use the shop's table (Clinic → bathroom, Mechanic → garage,
  Water Trader → kitchen, others → office); a home's crates are kitchen or garage, its shelves kitchen, bathroom,
  bedroom or office. In reach and nothing else claiming E: the prompt reads "E Search the shelf" (with the owner's
  name in red when it is somebody's) and E opens the PACK screen on it.
- **Theft:** moving anything from an owned box into your pack records one `steal` deed per box per 30 s at the
  thief's position (witnesses need to see you, not the inside of the shelf), sized `1 + worth/40` (max 4), worth one
  wanted star to a lawful witness. The owner who sees it remembers it (`robbedMe`); the PACK screen warns
  "TAKING IS STEALING".
- **Locks:** at a locked door with lockpicks in your pack, hold E 2.6 s to pick it (silent; one pick of six snaps; the
  door stays shut); with a crowbar (and no picks), hold E 1.3 s to pry it (an 18 m noise; the door bursts open; the bar
  is kept). A tap of E still kicks. From the PACK screen, using either acts on the locked door in front of you.
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
| Gun wear | `cond ← max(0, cond − wear)` per round; wear: pistol 0.0012, SMG 0.0007, shotgun 0.0018, rifle 0.0009 | the 0.82 starting revolver breaks after ~680 rounds with no care |
| Jam chance | per shot, if `cond < jamBelow`: `(jamBelow − cond) · jamRate · jam`; jamRate 0.06, jam: pistol 0.5, SMG 1.6, shotgun 0.6, rifle 1 | SMG at 0.3: 0.35·0.06·1.6 = 3.4% a round, a jam every ~30 rounds |
| Clear time | `clearTime · reloadMul`; the stuck round is lost | 0.9 s at DEX 0 |
| Kit | `cond ← min(kitMax, cond + kit)` = `min(0.95, cond + 0.35)`; refuses at cond 0 | 0.3 → 0.65 |
| Gunsmith | `max(smithMin, round((1 − cond) · value · smith))`, smith 0.6, smithMin $10 | broken revolver ($80): $48; rifle ($350) at 0.5: $105 |
| Found gun | cond ∈ `GUN_FOUND[faction].cond`, loaded = `round(mag · U(loaded))`, spare = `round(U(spare))` rounds | soldier: 62–95%, 9–30 loaded, 20–60 spare |
| Round weight | `kg · n`; pistol 0.012, SMG 0.008, shell 0.045, rifle 0.025 kg; bulk 0.006 / 0.004 / 0.04 / 0.012 L | 100 rifle rounds: 2.5 kg, 1.2 L |

## 5. Edge cases

- **No room for a find:** it stays where it lay, as a ground pile ("· NO ROOM").
- **Swapping to a smaller pack** is refused if what you carry wouldn't fit in it.
- **The other side drives off or you walk away** (more than 3.2 m, or out of reach of the car): the screen falls back to
  what is here now.
- **Dying with the pack open** closes it. Death keeps your things (Doc Reyes takes cash, not your pack).
- **Old saves** without `inventory` load the start kit; trunks are saved by vehicle id and restored onto the same ids.
- **Items a save names that no longer exist** are dropped on load.
- **A body that is recycled** (character budget) keeps its container until the 60-body cap forgets it.
- **A save from before rounds were items:** `g.inv.ammo` comes back as plain numbers and the pack holds no rounds;
  `bindAmmo` (called after every load) makes the carried count equal those numbers, so the rounds appear in the pack
  (any that will not fit at your feet). A save from after loads its rounds with the pack and the numbers agree.
- **Your last gun** stays on you: stowing it is refused ("your last gun stays on you"); the engine has no unarmed mode.
- **Stowing or swapping a gun clears its jam** (you work the action as you put it down) and cancels a reload or clear in
  progress; switching guns mid-clear cancels the clear (the jam stays on the gun you put away).
- **Rounds bought or handed to you with a full pack** go to the trunk of the car you are in, else the ground at your
  feet; nothing is lost.
- **A gun taken out of a shop's box** is theft like anything else (one `steal` deed per box per 30 s).
- **A gun with no rounds in it** is still a gun: it slings empty and you reload it from your pockets.
- **Old saves** without `cond` treat every gun as clean (1.0); without `jam`, nothing is jammed.

## 6. Dependencies

- `web/src/main.js`: construction, the pickups (`pickItem`), V (`quickUse`), I/Tab, bodies in `onKill`, pack update.
- `web/src/systems/skills.js`: carried weight includes `inventory.kg()`.
- `web/src/systems/survival.js`: needs and pips (items write `g.needs`, then re-pip).
- `web/src/systems/vehicledamage.js`: tyres, engine, radiator, tank, fuel (tools act on them).
- `web/src/systems/stunts.js`: piles sit on ramp/dune height.
- `web/src/ui/qol.js`: Esc leaves the PACK screen to close itself; the pause-menu key list names I and V.
- `web/src/agent/api.js`: `inventory`, `item`, `pack`, `gun`, save/load (restore calls `bindAmmo`), `fire`/`engage`
  (wear, jams, broken), the selftest checks (stage tops rounds up to 60 rather than adding: rounds weigh now).
- `web/src/systems/combat.js`: `WEAPONS` (mag, ammo kind, names) for guns as items.
- `web/src/main.js`: `handleShooting`/`reload` (the jam and broken rules), `onKill` (`armBody`), the ammo pickup.
- `web/src/data/npcs.js`: Ike sells guns through `gainGun`, fixes guns (`smithQuote`/`smithFix`), sells kits and rifle
  rounds. `web/src/ui/dialogue.js`: a choice's text may be a function (a price that depends on what you carry).
- `web/src/ui/hud.js`, `hud.css`, `hudart.js`: the condition gauge, the JAMMED/BROKEN stamp, the rifle cartridge.
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
| GUN_WEAR.*.wear | data/items.js | 0.0007–0.0018 | 0.0003–0.004 | how many rounds a gun lasts between cleanings |
| GUN_WEAR.*.jam | data/items.js | 0.5–1.6 | 0.2–3 | which guns jam readily (the cheap SMG) |
| GUN_CARE.jamBelow / jamRate | data/items.js | 0.65 / 0.06 | 0.4–0.8 / 0.02–0.12 | when worn guns start to jam, and how often |
| GUN_CARE.clearTime | data/items.js | 0.9 s | 0.5–2 | how much a jam costs in a fight |
| GUN_CARE.kit / kitMax | data/items.js | 0.35 / 0.95 | 0.2–0.5 / 0.8–1 | how far a kit goes; whether the gunsmith still matters |
| GUN_CARE.smith / smithMin | data/items.js | 0.6 / $10 | 0.3–1 | what keeping a gun costs at Ike's |
| GUN_FOUND | data/items.js | per faction | — | what the dead's guns are worth taking |
| ammo kg / bulk | ITEMS.ammo_* | see formulas | — | how many rounds you can haul |

## 8. Acceptance criteria (selftest)

1. A water pickup lands in the pack; V drinks from it (water up, the bottle at 2/3); a tin is refused without a blade
   and eaten with a knife; a backpack swaps in for the satchel (room > 20 L, the satchel back in the list).
2. A killed raider leaves a searchable body; searching twice from the same seed gives the same things; carrying 6 kg of
   scrap raises the carried weight by 6 kg.
3. The survival check: thirst fixed by drinking a found bottle with V (pips back to 0).
4. Taking two bandages from Doc Reyes's shelf with her at your shoulder: a `steal` deed with a witness, and she
   remembers it (robbedMe).
5. At a locked back door: lockpicks open it with no noise and five picks left; locked again, a crowbar opens it with a
   noise and is still in the pack.
6. Rounds: a reload from 30 loose pistol rounds leaves 6 in the gun and 24 in the pack (both the view and the pack
   say so), and the carried weight drops by exactly 6 × 0.012 kg; adding 40 more shells than the pack has room for
   leaves exactly 40 at your feet; a pack with no rounds and `ammo.pistol = 50` as a plain number binds to 50 rounds
   in the pack (and the save JSON says 50).
7. Guns: a Remnant soldier killed beside you leaves `gun_rifle` at 62–95% with 9–30 rounds in it and ≥ 20 spare rifle
   rounds; Space on it in the PACK screen slings it into your hands with exactly that condition and those rounds;
   Space on the slung rifle beside a car puts it in the trunk unchanged; a revolver at 0.2 that jams has a dead
   trigger (a pull starts clearing, nothing fires) and after the clear time is unjammed with one round fewer; a kit
   adds 0.35; at 0 a pull does nothing and a kit refuses; Ike's fix makes it 1.0 for `round(80 × 0.6)` = $48.

## Gear: the paperdoll, armor, and the original's guns and goods

**Status:** SHIPPED 2026-10-23 on `feat/web-dogs-gear`. Code: `web/src/data/gear.js` (SLOTS, GEAR, HIT_ODDS, SOAK_CAP,
MOD_CAP, GEAR_LOOT), `web/src/systems/gear.js` (the wearer), consumers in `systems/combat.js`, `systems/skills.js`,
`systems/ai.js`, `systems/inventory.js`; the paperdoll on the PACK screen (`ui/inventory.js`, `ui/hud.css`); the
scenario `pack-gear` stages it. Agent command `gear`; selftest "gear: …" (3). Ported from the original game's
`game/proto3d/gear.gd`, `character.gd` and `data/equipment.json` (the 19-slot paperdoll, soak per body part, the mods
on the clothing slots), its guns (`weapon.gd`: the pistol and the pump) and goods (`items.json`) and its loot tables
(`loot_tables.json`: the buried cache, the rare cache, the armor cache, the gun safe, the police locker).

### G1. Overview

You wear things in **19 slots**: six armor slots (head, neck, chest, arms, hands, legs), seven clothing slots (coat,
under, belt, feet, sash, face, back) and six accessory slots (two ears, two rings, a charm, a wrist). Every slot starts
bare and holds one piece. A piece is a row in `GEAR` and also an item (`ITEMS`, kind `armor` or `gear`): found, carried,
bought, stolen and dropped like any other thing, and worn from the PACK screen. **Armor soaks**: a hit on a body part
is cut by the summed soak of everything worn over that part, at the one damage choke point (`combat.damage`). The
other slots carry **mods**, each read by exactly one consumer: carry kg, speed on foot, reload time, how close a
hostile has to be to spot you, how well your patches hold, and extra finds in a box you open first. The back slot is
the pack you wear (satchel, backpack, frame ruck), so there is one thing on your back.

The original's **guns** come over as rows: the **self-loader** (a twelve-round pistol on the SMG's small rounds) and
the **pump shotgun** (five in the tube); and its **goods**: dried meat (what dogs come for), trail coffee (rest),
rotgut, road flares (a minute of fire), a machete (a blade) and a fire axe (pries doors, loudly), and a dog collar
(on a dead dog's remains, WEB_DOGS.md). New loot tables hold them; a few rows join existing tables (issue armor in the
armory and on soldiers, junk armor on raiders, clothes in bedrooms). Shop tables are left alone.

### G2. Player fantasy

The soldier at the wire had a plate carrier, and you took it off him before the sand did. It weighs three kilos and
you feel it on the run, but the round from the roof that should have opened you up knocks the wind out of you
instead. A brush poncho means the Dustwolf with the rifle is fifteen metres closer before he picks you out of the
scrub. You wear a dead man's rabbit's foot because the last three crates you opened had something in them.

### G3. Detailed rules

- **Wearing** (PACK screen: F, or E, on a gear row in your list; agent `gear wear=<id>`): the piece leaves your list
  and goes in its slot; what was in the slot goes back in your list. **Taking off** (click a worn slot's chip; agent
  `gear off=<slot>`): into your list, or the ground at your feet with no room. A piece on the other side has to be
  taken first.
- **Weight:** what you wear still weighs (`inventory.kg` adds it) but takes no room.
- **Soak:** a hit (any cause except fire, drowning, a bad tin, a fall) lands on a part: the caller names it, or it is
  rolled by cause (`HIT_ODDS`: a bullet hits the torso half the time, a bite goes for the legs and arms, a car takes
  the legs); a blast spreads over every part and armor takes half its soak. The cut is the sum of every worn piece
  that covers that part, capped at 75%.
- **Mods** (summed over every slot, capped): `carry` (+kg on `skills.carryKg`), `speed` (× on `skills.speedMul`, the one
  speed site), `reload` (× (1 − r) on `skills.reloadMul`, which the reload and the jam-clear both use), `stealth` (the AI's
  spotting range × (1 − s) for you, `ai.scan`), `repair` (× (1 + r) on a duct tape or plug patch, `inventory.act`),
  `luck` (extra rolls in a box the first time you open it, `inventory.roll`: drawn after the box's own, so they only
  add). `unarmed` (the rings) has **no consumer**: this engine has no bare-hands fighting yet; the PACK screen says so.
  The face and ear slots hold pieces with no effect yet (the original's own unwired four).
- **What it looks like:** a chest piece puts a vest on your body, a helmet a helmet, a coat a poncho, a sash a
  bandolier (`characters.js` styles), coloured by the piece.
- **The PACK screen:** under the header, the paperdoll: three rows of slot chips (armor first, highlighted), each with
  what is in it; the soak per body part; then your dogs (name, breed, tier, hp, the command it is on). A gear row's
  detail says its slot (and what it would swap), its soak and covers, or its mod in words.
- **Saving:** `gear` in the save holds the worn slots; a piece the catalog no longer has, or in the wrong slot, is
  dropped. A save from before the paperdoll loads bare.
- **The guns:** the self-loader (dmg 22, 12 rounds, SMG rounds, semi-auto, 1.2 s reload) and the pump (7 pellets of 15,
  5 shells, 0.95 s between shots, 2.4 s reload) each have their own model in the hand, wear and jam rows, an item and
  a weight; a point-blank hit from any scattergun pops a head, not only the sawn-off's.

### G4. Formulas

| Name | Formula | Example |
|---|---|---|
| Part soak | `min(0.75, Σ soak of worn pieces covering the part)` | soft vest + trauma insert on the torso: 0.36 |
| Hit after armor | `dmg × (1 − soak)` (before the difficulty multiplier) | 40 on a soft-vested torso: 30.4 |
| Blast soak | `mean(part soaks) × 0.5` | vest + helmet: (0.24+0.24)/4 × 0.5 = 0.06 |
| Armor kg | chest `0.8 + 0.7t`, head `0.4 + 0.3t`, legs `0.6 + 0.5t`, other armor `0.3 + 0.2t`, the rest `0.4 + 0.1t` | soft vest (t3): 2.9 kg |
| Value | `(soak ? 40 : 18) × tier` | combat helmet: $160 |
| Carry | `24 + 3.5·STR + perk + Σ carry` (cap +24) | rig belt: +10 kg |
| Speed | `load multiplier × (1 + Σ speed)` (cap ±0.15) | trail runners: ×1.08 |
| Reload | `(1 − 0.03·DEX) × (1 − Σ reload)` (cap 0.3) | double bandolier: ×0.86 |
| Spotted at | `AI range × (crouch 0.6) × (1 − Σ stealth)` (cap 0.45) | brush poncho: 30 m → 26.4 m |
| Luck | `+round(Σ luck)` rolls (cap 3) | scavver's compass: +2 rolls |

### G5. Edge cases

- **The last gun stays on you;** the paperdoll never holds guns.
- **Wearing a piece over a full list:** the old piece goes to the ground if the list has no room for it.
- **Armor and god mode / respawn grace:** nothing is cut when nothing lands.
- **Fire and drowning** go through armor; a blast is half-soaked.
- **A gear piece in a shop** is bought like anything else; out of an owned box it is theft.
- **Somebody else in armor:** `combat.damage` soaks for any character with `c.worn` (same shape as the player's); no
  NPC wears any yet (their bodies carry found armor as loot).
- **Luck and the same-seed rule:** a box rolls the same base loot from its seed; luck only appends rolls drawn after.

### G6. Dependencies

`combat.js` (damage, the `part` argument), `skills.js` (carry, speed, reload), `ai.js` (scan), `inventory.js` (kg,
repair, roll; flares), `characters.js` (the vest, helmet, poncho and bandolier styles; the new gun models),
`throwables.js` (`startFire` for the flare), `ui/inventory.js` + `hud.css` (the paperdoll), `agent/api.js` (`gear`, the
save, the checks), `data/items.js` (gear registered as items, the guns and goods, loot merged), `data/skills.js`
(the new guns' weights).

### G7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| GEAR.*.soak | data/gear.js | 0.03–0.42 | 0–0.6 | how much a piece stops |
| SOAK_CAP | data/gear.js | 0.75 | 0.5–0.85 | never bulletproof |
| BLAST_SOAK | data/gear.js | 0.5 | 0.25–1 | armor against a blast |
| HIT_ODDS | data/gear.js | per cause | — | which part a hit finds |
| MOD_CAP | data/gear.js | carry 24, speed 0.15, reload 0.3, stealth 0.45, repair 0.35, luck 3 | — | stacking |
| GEAR.*.carry/speed/reload/stealth/repair/luck | data/gear.js | per piece | — | each slot's worth |
| GEAR_LOOT / GEAR_LOOT_ADD | data/gear.js | rows | — | where gear turns up |
| WEAPONS.auto / pump | systems/combat.js | rows | — | the original's guns here |

### G8. Acceptance criteria (selftest "gear: …")

1. A 40-point bullet on the torso with the soft armor vest on does exactly `(1 − 0.24)` of the bare hit; on the legs
   (the vest does not cover them) exactly the bare hit.
2. Trail runners move `speedMul` ×1.08, a rig belt `carryKg` +10, a double bandolier `reloadMul` ×0.86, a brush poncho
   `seenMul` to 0.88, and a scavver's compass makes a box of the same seed roll at least as much (the same items first).
3. A helmet worn through the `gear` command and a vest and boots worn: saved, stripped, loaded: all three back in their
   slots, the PACK screen's paperdoll names them with the soak line, and the body wears a vest and a helmet.

## Open (phase 2)

A search time and its noise; locked boxes (a gun safe); trade (sell to traders at standing-adjusted prices; guns
priced by condition); a portable radio item that gates STATIC 1660 AM away from cars and the station; refilling
bottles at pumps and the river; magazines as things (loading a spare magazine is a reload you can prepare); a
timed clean (a kit takes a minute you spend standing still).


> **Crafting (2026-10-29):** slots of durable items carry `cond` (tools wear), manuals use act `learn` with `keep`, a repair kit uses act `mendgear`, and the PACK screen has a CRAFT tab (Q / pad LB). See WEB_CRAFTING.md.
