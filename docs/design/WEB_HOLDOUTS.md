# WEB_HOLDOUTS — every town is its own little kingdom

Status: **v1 landed on `feat/web-holdouts`** (G7 of `WEB_DEATHLANDS_GAP.md`, grade D → this). Code: `web/src/data/holdoutgen.js`
(rows), `web/src/world/holdoutgen.js` (the generator, `validateHoldouts`), `web/src/world/holdout.js` (lays a holdout out —
Meridian's and the generated ones; the wall kit and the pit are new there), `web/src/systems/holdouts.js` (the law: the
gate check, HOUSE RULES, local wanted, the bulls' rounds, house paper, save), `web/src/ui/holdoutcard.js` (the Keyholder's
card), `web/src/agent/holdouts-api.js` (the `holdouts` command and nine selftest checks), `web/src/scenarios/holdout-tour.js`,
`web/tools/holdout-shots.mjs` (renders in `docs/renders/web/holdouts/`).

## 1. Overview

A **holdout** is a walled town at an interstate exit, ruled by a **Keyholder** who holds the key to its one gate. Before
this lane there were two, both hand-built (Rust Haven, Meridian) and no rules. Now a generator turns a seed and four params
(size, wealth, Keyholder kind, region palette) into a full HOLDOUTS row that the existing layout code lays out — no second
layout system. Eight are seeded: one per exit town in the streamed regions (Arizona I-10: Furnace Mile, Las Palmas;
Florida I-95/I-75: Sebastian, Little River, Daytona, The Alley, St. Augustine, Canal Locks), the first five hand-polished.

Each holdout has: a wall from a **kit** (stacked car husks, shipping containers, patched tin, sandbags, a rubble core, junk
at its foot) with tin-sheathed gate and corner towers; Main Street from the gate; **the Swap** (market), **the saloon**,
**the clinic**, **the jail**, **the pit**, **the water tower**, the Keyholder's hall; at size medium+ a gunsmith, boarding
house and garage with its boneyard; at large, gardens and a scrap yard. People: the Keyholder (named, a real flag), a
doctor, a saloon keeper, a **sutler** who changes paper, two **gatemen** in the gate's mouth, **bulls** (armed guards with
real rounds), and townsfolk.

## 2. Player Fantasy

You come off the interstate and the road runs to a wall of dead cars and rusted boxes. Two gatemen step into the gap:
*"Hold it. This is SEBASTIAN, and WATER BOSS Odessa Varga keeps the key. House rules: 1. A WATER TITHE AT THE GATE.
2. GUNS CHECKED AT THE GATE."* You can do as you're told, pay to be waved through, lie to their faces if you have the
tongue for it, or draw. Inside, the rules are the Keyholder's, not the country's: raise a gun where a bull can see it and
that town wants you — only that town. Every town's paper is good at home and worth less the farther you carry it.

## 3. Detailed Rules

**Generation** (`generateHoldout(spec)`, pure):
1. Size → wall (`SIZES`: small 204×172, 2 columns; medium 280×192, 3; large 360×232, 4), bulls, folk, lamps.
2. Wealth (+ the Keyholder's lean) → wall height, burnt share of the back rows, toll, bribe, more stalls and bulls.
3. Side of the road → the main gate faces it (W of a N-S road: east gate; N/S of an E-W road: the west gate's mouth square
   to the exit, the access road down the outside of the west wall). East of I-95 the lagoon shore holds the town back.
4. Blocks: column 0 (nearest the gate) holds THE KEY ROW (hall, jail, clinic; houses behind) and MAIN STREET (saloon,
   sutler, water; houses behind); column 1 the Swap and the pit; 2 the gunsmith/boarding house with the water tower and
   the garage with its boneyard; 3 the gardens and the scrap yard. Lots are `{kind, label}` so a generated town names its
   own buildings (THE JAIL, THE SALOON, THE VALVE HOUSE…) on Meridian's floor plans.
5. HOUSE RULES: the polish's, else 1 (45%) or 2 (55%) drawn from `HOUSE_RULES` weights + the Keyholder's lean.
6. The card: name and flag (polish, or drawn from the region's flag mix), title, one vice, one law, a road legend (an
   atlas `keyholder` line), the paper's name.

**The gate check** (`systems/holdouts.js`): within `GATE.trigger` (8 m) of the gate's outside mouth, not passed, a gateman
alive within `GATE.talk` (5.2 m) → the dialogue opens (the sim holds while it is open). The gateman reads the rules and
the demands (guns, toll in house paper, a water, leave the car). Choices:
- **Comply** — guns (in hand and spares) go into the gate locker; toll/tithe taken; the car stays outside. Greyed with the
  reason when you can't (no paper, no water). The guns come back when you leave past `GATE.leaveR` (60 m) or walk out
  through the gate.
- **Buy paper at the gate** — when the toll is in paper you don't carry.
- **Bribe** — `gate.bribe` dollars, guns kept; greyed at an incorruptible Keyholder's gate (the Judge, the Preacher).
- **Lie** — a dialogue `req: { skill: { persuade: gate.lie } }`; below it the choice stays greyed with the reason
  (`Persuade 0/29`); above it you pass with everything you carry.
- **Draw on the gateman** — a `threaten` deed against the gateman (`deeds.record`), local wanted +2, every guard of the
  town turns on you.
- **Turn back.** The gate asks again after 6 s.
While you are wanted there, the gateman asks for the fine instead (`WANTED.fine` × level dollars) — pay or fight.

**The rules inside** (checked every 0.25 s while you are inside the wall): each rule's predicate (`gunOut`, `dogLoose`,
`drinkUntithed`, `abroadAtNight`, `driving`, `armedInSwap`; night = 22:00–05:00) plus THE GATE (inside without a pass).
While a rule is broken, once a second, the **existing witness pass** (`deeds.witnessPass`: sight by day/night/fog,
facing, walls, floors) is asked who can put a name to your face. If one of them is a guard of that town (a bull, a gateman
or the Keyholder), the break becomes a deed on the record (`deeds.record('trespass', {label: rule · town})`) and local
wanted rises by the rule's heat; the town's bulls and Keyholder take a vendetta (they shoot on sight — that town's people
only; the global stars and every other faction are untouched). Unseen: an `houseRuleUnseen` event and nothing else. One
raise per episode (a rule kept broken does not stack each second).

**The bulls** carry the rounds the generator gave them (`rounds: [16, 40]`). A reload is paid out of them (`_load`),
exactly; dry, they put the gun up and fight hand to hand. Their body holds their gun with what was in it and the rounds
left — no more, no less.

**House paper**: each town's own; buy at its gate or its sutler, sell anywhere (its own sutler at `cashOut`, anyone
else's at its worth there less the cut). Carried paper and every standing ride the save (`snapshot().holdouts`).

## 4. Formulas (with example)

- Paper's worth at a point: `rate = face × max(floor, 1 − perKm × max(0, km − edge))`, `km` = distance from the home
  holdout's centre, `edge` = its half-size in km. Selling: `floor(n × rate × k)`, k = `cashOut` (0.9) at home, `1 − cut`
  (0.9) elsewhere. Buying: `ceil(n × face × buy)`, buy = 1.1.
  **Example:** 20 SEBASTIAN WATER CHITS. Little River is 18.89 km away, edge 0.14 km → rate = max(0.2, 1 − 0.02 × 18.75) =
  0.625 → sells for floor(20 × 0.625 × 0.9) = **$11**; at home floor(20 × 1 × 0.9) = **$18**; in Arizona (2,000+ km) the
  floor: 20 × 0.2 × 0.9 = **$3**. Buying 40 at the gate costs ceil(40 × 1.1) = **$44**.
- Gate terms: `toll = round(4 + 8 × wealth)` notes; `bribe = round(25 + 35 × (0.4 + 0.6 × wealth))`;
  `lie = round(18 + 22 × u)` Persuade, u ~ U(0, 0.6) (0.8 at an incorruptible gate).
  **Example (Sebastian, wealth 0.65):** toll 9, bribe round(25 + 35 × 0.79) = **$53**, lie **29** (both as the render shows).
- Persuade check (existing `stats.check`): `eff = skill + 4 × (charm − 5)`; pass when `eff ≥ lie`.
- Local wanted: `W' = min(3, W + heat)` per seen break (heat 1–2, THE GATE 2, a drawn gun 2); cools `0.25` levels per
  game hour while you are more than 30 m outside its wall (1 game hour = 30 s real) → wanted 2 clears in 8 game hours
  (4 real minutes); the fine clears it at once: `40 × ceil(W)` dollars.
- Bull reload: `load = min(mag − inMag, rounds)`, `rounds −= load`; after the reload `mag = load + inMag − fired`.

## 5. Edge Cases

- **Meridian** keeps every byte: its row never goes through the generator (no `place`, no `kit`, no `mainGate`); the new
  code paths branch only on those fields; its layout hash is pinned (`22729e79`) and checked; it stays the region's first
  holdout (respawn and the new-game start read the first).
- **A generated town where a community stood**: the exit's access road runs to the town's approach; the exit row is not
  changed (seeds name their exit). An exit that serves a town row (Rosewood, The Dry Dock) is never replaced.
- **Real terrain** (Arizona): dead cars now ride the land (`chunkgen` lifts copies of the records; y is not in the hash);
  desert scatter and forest stands keep out of an Arizona holdout as they do out of a region's.
- **The cemetery** placed beside every holdout goes on the side away from its main gate.
- **Gate check in a car**: the stop works at the wheel; Comply with NO WHEELS leaves the car where it is.
- **No guns at all**: Comply hands over nothing (the choice still reads "hand over 0 guns"); the locker stays empty.
- **Last gun**: the engine runs gunless while the locker holds them (fists); they come back on the way out.
- **Talking to a gateman** outside a stop: they carry no talk tree (a body with one drops no container); the gate tree is
  theirs only while the stop is open.
- **The battery**: the law is off for the full selftest (a check walking past a gate would be stopped) and on inside its
  own stage.
- **Faction budget (16)**: all generated towns share one faction (`holdfolk`); each town's own law is its local wanted.

## 6. Dependencies (both ways)

| This needs | What for | Back-reference added |
|---|---|---|
| `world/holdout.js` (Meridian's layout) | lays a generated row out; gained `place`, `mainGate`, the wall kit, `{kind,label}` lots, the pit | — (same lane) |
| `world/worldindex.js` exits | seeds stand at exit towns (Florida exits by name, Arizona I-10 rows by id) | comment at `seededHoldout` |
| `systems/regions.js` | brings the people in (gatemen and bulls records, the talk hook, the shared faction) | header lines |
| `systems/deeds.js` / `witnesses` | the witness pass and the deed record are the enforcement | `WEB_WORLD_MEMORY.md` (see below) |
| `ui/dialogue.js` `req` | the lie is a Persuade check; locked choices show the reason | none needed (no change) |
| `systems/trade.js` TRADERS | the sutler, saloon keeper and doctor trade as Meridian's do | `WEB_TRADE.md` (see below) |
| `world/chunkgen.js` | Arizona holdouts keep scatter out; wrecks ride the land | inline comments |
| `systems/rites.js` | the holdout cemetery off the gate side | inline comment |
| `data/atlas.js` `keyholder` lines | the road legend on each card | — |

Depends on this: the Carousel lane (arrivals in a region land near holdouts), the crew lane (a crew member's trust can read
house-rule deeds — they are ordinary `trespass`/`threaten` deeds), the storeys lane (generated lots use the same KINDS,
so taller buildings arrive in holdouts for free).

## 7. Tuning Knobs (safe ranges)

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `SIZES.*.size` | 204×172 / 280×192 / 360×232 | 180–420 per side (civic row must fit: `validateHoldouts`) | town footprint |
| `WALL_KIT.container.second` | 0.75 | 0.3–0.9 | how often containers stack two high |
| `WALL_KIT.husk.stack` | [3, 4] | [2, 4] | husk pile height (≥ 5 reads silly) |
| wall `h` | 5.6 + 0.6 × wealth | 4.5–6.5 (`LIMITS.wallH`) | wall height |
| `GATE.trigger` / `GATE.talk` | 8 / 5.2 m | 6–12 / 4–5.8 (dialogue closes past 6 m) | when the gate stops you |
| `GATE.bribe` | [25, 60] | [10, 120] | the price of a blind eye |
| `GATE.lie` | [18, 40] | [10, 60] (Persuade 0–100) | how hard a lie is |
| `WANTED.cool` | 0.25 / game h | 0.1–1 | how long a town remembers |
| `WANTED.fine` | $40 × level | 20–100 | the price of forgiveness |
| `SCRIP.perKm` / `floor` | 0.02 / 0.2 | 0.005–0.05 / 0.1–0.5 | how bad far paper is |
| `SCRIP.buy` / `cashOut` / `cut` | 1.1 / 0.9 / 0.1 | 1.0–1.3 / 0.7–1 / 0–0.3 | the house's spread |
| `HOUSE_RULES.*.heat` | 1–2 | 1–3 | how wanted one break makes you |
| bulls `rounds` | [16, 40] | [6, 80] | how long a bull can shoot |

## 8. Acceptance Criteria (each a selftest check — `selftest only="holdouts:"`)

1. **Deterministic** — every seed hashes the same twice, seed+1 differs, the world's town is its seed's; every row
   (Meridian too) passes `validateHoldouts`; towns in both regions; every town has its hall, jail, clinic, saloon, sutler,
   Swap, pit and water tower laid out.
2. **Walkable** — for every generated town: the gate reachable from the exit's access road; the Swap, the pit and the
   doors of the hall, jail, clinic, saloon and sutler reachable from the gate; each of those buildings entered from its door.
3. **Gate check** — the stop reads every rule; comply puts the guns in the locker (and back on the way out) and takes the
   tithe; bribe costs exactly the bribe and keeps the guns; lie is greyed below Persuade and passes above it; drawing on
   the gateman is a deed, wanted ≥ 2, the guards hunt you, global stars and other towns untouched.
4. **HOUSE RULE by the witness pass** — a raised gun inside, a bull 40 m off looking away: not wanted, an unseen event;
   the same with the bull 9 m off facing you: wanted ≥ the rule's heat, the deed on the record naming that bull, the bull
   hunting you; nowhere else wants you.
5. **Bulls' rounds** — a reload takes exactly what they carry, a dry bull puts the gun up, a killed bull's body holds its
   gun with what was in it and exactly the rounds left.
6. **Paper** — face at home, the formula at Little River, the floor across the country; buy and both sells match quotes.
7. **Save/load** — local wanted with its rule, the gate locker, the paper you carry all come back.
8. **Golden** — Meridian's layout hash, it is the first holdout, never generated; the island golden holds.
9. **Look budget** — a large generated town at the widest zoom under 150 draw calls; every person a real flag; the card
   shows the Keyholder's flag behind it.
Renders: `docs/renders/web/holdouts/` (01 the wide frame against `target_town_wide.png`, 02 Sebastian wide, 03 the gate,
04 the gate check, 05 the card, 06 the Swap, 07 the pit, 08 Little River at dusk, 09 the wall kit). Scenario:
`scenario name=holdout-tour`.
