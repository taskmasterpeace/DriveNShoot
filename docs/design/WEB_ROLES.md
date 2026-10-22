# WEB_ROLES — you become what you keep doing

**Status:** 2026-10-22. SHIPPED in `web/` on `feat/web-roles` (0a727b1 role engine · 05198d9 people react · 168febb the
HUD tapes, pause menu, PACK header · a5fb9aa agent commands, save/load, packs · 841a565 merge with feat/web-engine's
trade · 3dfa15e eight selftest checks). Ten roles, four jobs, two offices, a director role call.
**Owner of the call:** Robert ("the role system should be HIGHLY dynamic and versatile", docs/RESUME_WEB_ENGINE.md,
Robert's answers). **Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`).
**Sources:** `docs/design/WEB_WORLD_MEMORY.md` (deeds, witnesses, factions, memory, the director, the chronicle),
`docs/design/WEB_TRADE.md` (the counter that calls priceMul), `docs/design/WEB_JUMPS.md`, `docs/design/WEB_INVENTORY.md`,
`docs/design/WEB_FAN_SERVICE_BIBLE.md` (the names).

---

## 1. Overview

No class is picked at a menu. A **role** is what the world calls you, and it is earned and lost by play: patch people
up and you are a medic; fly cars at the thrill show and you are a stunt driver; kill people who never raised a hand and
you are a butcher. Several are held at once, each at a **tier** (rumoured → known → renowned), and each one changes how
the world treats you through systems that already exist.

| Part | File | Holds |
|---|---|---|
| **Rows** | `web/src/data/roles.js` | `ROLES` (ten rows: what earns, what wears, tiers, what opens), `ROLE_JOBS`, `ROLE_OFFICES`, `ROLE_CALLS`, `ROLE_RULES` (tuning) |
| **Engine** | `web/src/systems/roles.js` | `g.roles`: routes signals to rows, keeps renown/tier per role, fades idle roles on the game clock, applies what the active tiers open, jobs and offices, save/load |
| **Surface** | `ui/hud.js` + `hud.css`, `ui/qol.js`, `ui/inventory.js` | stitched role tapes above the flag patch, toasts, the pause menu's WHAT THEY CALL YOU, the PACK header |
| **Agents** | `agent/api.js` | `roles`, `registerRole`, `item use=<med> on=<id>`, `simTick` fades roles, pack dialogue conditions, eight selftest checks |

The roles shipped, and what each opens (numbers are at renowned; known gets 0.7 of them, rumoured 0.4):

| Role | Earned by | Worn by | Opens |
|---|---|---|---|
| **Wheelman** | km at the wheel, seconds flat out, cars taken, people run down, air time | time (6 d) | Dustwolves read you +6, Remnant −6; Rust Haven's traders −5%; drivers you pull out run instead of fighting (known) |
| **Medic** | people patched up (`heal`, DEX helps), rescues, Doc Reyes's shifts, hours carrying a full kit | killing somebody harmless; time (8 d) | everyone reads you warmer; traders −5%; patching heals ×1.5; **Doc Reyes's shift** (kit + $90); the director's **role call** sends the hurt to you |
| **Scavenger** | first searches of crates, shelves, the dead, wrecks, army crates (STR helps); salvage carried off; hours hauling salvage; hours in the ruins | taking from a living person's shelf; time (6 d) | drifters −4, Dustwolves +4; +4 kg carry |
| **Deputy of Rust Haven** | Dustwolves put down, the sheriff's jobs (the bounty), townsfolk saved, raids beaten off near town, hours inside the wall | hurting, robbing or killing townsfolk; time (10 d). **Gate:** Rust Haven standing ≥ 20, ≤ 1 wanted star, and fewer than four records of killing its people in the chronicle's tally (forever) | Rust Haven +15, Dustwolves −15; Rust Haven's traders −10%; raids weigh ×1.5; **Okonkwo swears you in** (a star, $20 a Dustwolf, the bulls give one star of slack) |
| **Dustwolf Rider** | cars taken, robbery, killing the wolves' enemies, named jumps, km on a buggy/ATV/bike, hours at a camp | killing or shooting Dustwolves, working for Rust Haven; time (8 d). **Gate:** not hunted by the Dustwolves | **the Dustwolves hold fire** (known: a rider walks into camp), reading +40; Rust Haven −15, drifters −10, Remnant −10; wolves' prices −15%, Rust Haven +10% |
| **Trader** | deals struck, scrip changing hands (trade.js), goods delivered, hours carrying valuables | robbery, theft; time (8 d) | **every trader −8%**; drifters +5, Rust Haven +3; **Mags's water run** to Old Tomás ($60) |
| **Stunt Driver** | named jumps cleared (clean best, the first of the day best), air time, jumps somebody saw | time (6 d) | Dustwolves +8 (respect, not a welcome), drifters +3; named jumps pay ×1.25; **Kenji's crowd** at Wreck Row ($150 for a clean clear) |
| **Ghost** | kills, thefts and trouble nobody saw (a named witness counts for nothing) | being seen and named; time (4 d). **Gate:** no wanted stars | witnesses must stand closer to name you (×0.75); **Vo's lesson** (×0.85 more) |
| **Good Samaritan** | rescues, patching strangers up, standing up for people, raids beaten off, debts paid | killing somebody harmless, robbery, theft, carjacking; time (10 d) | drifters +12, Rust Haven +8, Remnant +4; drifters −10%, Rust Haven −5%; the role call; Mags's free canteen once a day |
| **Butcher** | killing people who never raised a hand (named ×1.5) | rescues, patching people up; time (14 d) | drifters and Rust Haven −20, Remnant −15, Dustwolves +10; drifters +30%, Rust Haven +20%; **Ike, Mags and Kenji refuse you** (known, dialogue and counter); **Rust Haven shoots on sight** and the unarmed run (renowned); hunters ×1.5 |

Every named person greets you by your best-known role in their own voice (`roleLines` in `data/npcs.js`), strangers call
it out as you pass, and STATIC 1660 AM names you by it in the morning digest and on the news.

## 2. Player Fantasy

*You patched up three strangers bleeding out on Route 66 because you had the gauze. By evening the drifters call you a
medic, Doc Reyes has work for you, and a man limps up out of the dark asking for "the one who patches people up". You
fly Wreck Row clean in front of Kenji's cousins and the radio talks about a stunt driver at the old thrill show. You
take four cars in a week and the Dustwolves start holding fire when your buggy rolls into camp, while the sheriff's
bulls watch you a little longer at the gate. Nobody ever told you what you are. You found out from them.*

Fan service (mechanics only, per the bible): GTA2's respect that changes who shoots, Autoduel's reputation that opens
jobs, Project Zomboid's sense that what you do shapes who you become, the Deathlands rule that a holdout's welcome
depends on what it has heard of you. No names cross: the jumper is a **Stunt Driver**, never "Daredevil" (a comic hero).

## 3. Detailed Rules

### 3.1 A role is a row
`ROLES.<id>`: `name`, `short` (the tape), `color` (never purple), `blurb`, `tiers` [rumoured, known, renowned] (default
20/45/75), `halfLife` (game days), `requires` (gates), `earn` and `wear` (rules), `opens` (effects). A pack adds one
with a `roles` section, an agent with `registerRole`; nothing about a role is code. A rule is `{ on, ...filters, pts,
per, div, max, seen, scale, namedMul, upTo, note }`; the note is the words the `roles` command and the pause menu use.

### 3.2 Signals (what earns and wears)
| Signal | Raised by | Filters |
|---|---|---|
| `deed` | `deeds.js record()`, every deed of yours, after the witness pass | verb, of (target faction), hostile (their people shot you on sight, asked before the witnesses raised stars), sd, named, night, cause, src (deed, dialogue, stunt), owner (a shopkeeper's shelf), identified |
| `drive` | `roles.update()` once a second at the wheel | vehicle; per km, or per second over 22 m/s (`fast`) |
| `jump` | `stunts.js score()` on your landings | named, cleared, grade, air (≥), fresh (first clear of that jump today), jump |
| `search` | `inventory.js open()`, a container's first roll (never a shop shelf) | kind (its loot table, or `body`) |
| `loot` | `inventory.js move()` out of a box nobody owns into your pockets | per value / div |
| `trade` | `trade.js deal()` (the counter) | faction, sell; per value |
| `event` | `director.js resolve()` | tpl, outcome, near (within 150 m of the raided town) |
| `hour` | `society.js` hourly tick, `simTick` | `while` conditions: carry, place, standing, wanted, tally, skill, driving, night, office |

Conditions (`requires`, `while`): `standing { faction: min }` (raw standing), `wanted` (max stars), `tally` /
`tallyUnder { 'actor|verb|target': n }` (the chronicle's lifetime counts - each deed and each telling of it that reached a
faction; they survive the ring), `skill { name: min }`, `carry { kind | ids, n | kg | value }`, `place` (an id or a
prefix like `camp_`), `driving [types]`, `night`, `office`. The first failing one is the suspension's reason, in words
(`RUST HAVEN STANDING 12, NEEDS 20`, `4 KILLS OF RUST HAVEN ON RECORD`).

### 3.3 Tiers, gates, activity
Renown R (0..100) sets the **tier** with hysteresis (§4.4). A role's `requires` are its **gates**: while one fails the
role is **suspended** - its renown, tier and earning go on, but the world acts on tier 0 (no effects) and a toast says
why (`DEPUTY OF RUST HAVEN: SUSPENDED (RUST HAVEN STANDING 12, NEEDS 20)`). The **active** tier is the tier when every
gate holds, else 0. Toasts and HUD tapes follow the active tier: `THEY SAY YOU'RE A MEDIC` (rumoured), `KNOWN AS A
MEDIC`, `RENOWNED MEDIC`; down: `MEDIC: ONLY A RUMOUR NOW`, `NOBODY CALLS YOU A MEDIC NOW`; back: `...: BACK IN GOOD
STANDING`. Events: `roleTier` (any tier change), `roleEarned`, `roleUp`, `roleDown`, `roleLost`, `roleSuspended`.

### 3.4 When it recomputes
On a signal (only the roles it touched), once a second of sim (`update`: the odometer, the gates, the street), and every
game hour (`tickHours`: trickles, fading). Never per frame: `update()` is a subtraction until its second is up. What the
roles open is re-applied only when an active tier (or a row, an office, a load) changes; the HUD rebuilds its tapes
only when `g.roles.version` moves.

### 3.5 What a role opens, and where
- **Factions** (`factions.js`): `bias[f]` is added to the standing faction f acts on (`reading(f)`); tiers, the AI's
  shoot-on-sight bit, the respect chips, dialogue `ifTier`, a base's waved-through rule, trade's price tier, named
  people's opinion and the director's hunters all read the reading. `roleHostile[f]` overrides: hold fire anyway (a
  known rider at a Dustwolf camp) or shoot on sight anyway (Rust Haven and a renowned butcher). Deeds, decay and saves
  only ever touch the raw standing.
- **Prices:** `g.roles.priceMul(faction, trader)` (§4.6) - trade.js multiplies buy prices and divides sell prices by it.
  Rust Haven's four traders (Ike, Reyes, Kenji, Mags) live in town, so their faction is `rusthaven`.
- **Perks:** `idMul` (deeds.js witness ID range), `carryKg` (skills.js), `healMul` (patching), `jumpPay` (stunts.js),
  `fear` (the unarmed run from a renowned butcher, once a second, at most four), `carjackFlee` (main.js).
- **People:** role-tagged dialogue choices (`{ role, from }` in `data/npcs.js`; packs: `ifRole`, `ifNotRole`, `ifJob`,
  `ifOffice`, effects `job: {start|pay}`, `swear`), `roleLines` (greetings and barks in their own voice, once a game
  day per person per role, known or better), `refuseRole` / `refusedBy` (dialogue and the trade counter close).
- **Jobs** (`ROLE_JOBS`): offered by a named person to a role at a tier (or an office), counted from the same signals,
  paid on the giver's word: Reyes's shift (3 heals, $90, a kit up front), Kenji's crowd (a clean Wreck Row, $150),
  Mags's water run (two canteens to Tomás, $60), the deputy's bounty ($20 a Dustwolf). Daily jobs reopen the next game
  day. A kit or a star that will not fit in your pockets goes in the trunk you're in, else at your feet (`inventory.stow`).
  A running job takes the ORDERS tag if nothing else holds it.
- **Offices** (`ROLE_OFFICES`): Okonkwo swears in a known deputy (a `tin_star` in your pack, the bounty job, one wanted
  star of slack in `ai.js`); it lapses with the role and the star is taken back. Vo's lesson makes a known ghost harder
  to name; it lasts, but works only while the ghost role is active.
- **Director:** template weights (`director: { tpl: w }`), the role-coloured reading in `bind_hunters`, the **role
  call** (`EVENTS.role_call`, `ROLE_CALLS`): a hurt stranger spawned out of sight walks up to a known medic or samaritan
  and asks; patching them up is success, their death a failure, 150 s a timeout. The morning digest adds the best-known
  role's clause; a role newly known or renowned is radio news (`peekNews`, read when it airs).

### 3.6 Patching people up (the new verb)
Talk to someone hurt (under 85% or bleeding) with a med item on you: the first choice is `Let me patch you up
(bandage)`. `inventory.treat(c)` picks the best item for them (a bleed-stopper if they bleed, the most it can heal),
heals them 1.5× what it heals you × `healMul`, stops the bleeding, spends one, and records a `heal` deed (VERBS.heal = 2):
the patient sees your face and their people warm to you (`heal:self` +3), a named patient remembers `helped`.
Agents: `item use=<med> on=<id>`.

## 4. Formulas

**4.1 Earning.** `ΔR = p · u · s · Π_k (1 + a_k · L_k) · (1 − R / S)`, then `R = min(cap, R + ΔR)`.
- p: the rule's pts; u: units (1, the deed's mag, km, fast seconds, or value / div, capped at max); s: who saw it
  (deeds only: named you `id` = 1, saw something `saw` = 0.6, nobody `none` = 0.35; a dialogue deal is face to face,
  `id`); L_k: a skill's level (0-10), a_k: its per-level scale; S = 110 (soft); cap = 100, or the rule's `upTo` for an
  hour trickle (trickles never reset the idle clock).
- Range: ΔR in [0, p·u·s·(1 + 10a)]; the soft term makes the last 25 renown the slowest.
- Example (medic, DEX 2, three patients who each see your face): `8 · 1.1 = 8.8` → R 8.8; `8.8 · (1 − 8.8/110) = 8.1` →
  16.9; `8.8 · (1 − 16.9/110) = 7.45` → 24.3: rumoured.

**4.2 Wearing.** `R = max(0, R − p · u)` (flat: a contrary deed takes what it takes).
- Example (sworn deputy at 52.2 shoots a townsman twice): hurt −8 → 44.2, kill −30 → 14.2: under the rumoured keep line
  (15), the role and the office go.

**4.3 Fading.** Idle hours I count from the last earning signal. With grace G = 12 h, an hourly tick of h hours fades
`over = max(0, I + h − G) − max(0, I − G)` of them: `R = R · 2^(−over / (24 · H))`, H the role's half-life in game days.
- Range: a role halves every H days of not doing it; a game day is 12 real minutes, ×40 with fast time (T).
- Example (medic, H = 8, R 22): 60 h idle: `22 · 2^(−48/192) = 18.5` (still rumoured, §4.4); 120 h more:
  `18.5 · 2^(−120/192) = 12.0`: forgotten.

**4.4 Tiers with hysteresis.** Lines T = [20, 45, 75], keep κ = 0.75. Up while `R ≥ T[t]`; down while `R < κ · T[t−1]`.
- Keep lines: rumoured kept to 15, known to 33.75, renowned to 56.25.
- Example: R 18.5 after reaching rumoured: under 20, over 15 → still rumoured. R 12 → none.

**4.5 Reading and override.** `k_t = [0, 0.4, 0.7, 1]` by active tier.
`bias_f = clamp(Σ_r standing_{r,f} · k_{t_r}, −50, 50)`, `reading_f = clamp(standing_f + bias_f, −100, 100)`; the tier and the
AI's bit come from the reading. Override `o_f = Σ_r ±k_{t_r}` over roles with `hostile` set and active tier ≥ `from`:
o > 0.01 shoots on sight, o < −0.01 holds fire, else the tier decides.
- Example: a known rider: `40 · 0.7 = 28` → Dustwolves −60 + 28 = −32 (wary) and hold fire; Rust Haven 10 − 10.5 = −0.5.
- Example: renowned stunt driver + known medic + rumoured wheelman: Dustwolves `−60 + 8 + 2.8 + 2.4 = −46.8`: still
  hostile (only a rider walks into camp).

**4.6 Prices (the trade contract).** `priceMul(f, trader) = clamp(Π_r (1 + (m_{r,f} − 1) · k_{t_r}), 0.5, 2)`, with
`m_{r,f} = prices[f] ?? prices['*']` and `f = f ?? trader.fid`. trade.js: `buy = PRICE_TIER[tier].buy · m`,
`sell = PRICE_TIER[tier].sell / m`.
- Range: 0.5..2 (1 = no change).
- Example (known trader + renowned deputy at Ike's, Rust Haven friendly): `(1 − 0.08 · 0.7) · 0.9 = 0.85`;
  buy 1.15 · 0.85 = 0.98 of worth, sell 0.5 / 0.85 = 0.59 of worth.
- Example (known rider at Ike's, neutral): `1 + 0.1 · 0.7 = 1.07` → buy 1.3 · 1.07 = 1.39 of worth.

**4.7 Perks and weights.** A multiplicative perk: `P = Π_r (1 + (p_r − 1) · k_{t_r})`; an additive one (`carryKg`):
`Σ p_r · k`. Director weight: `w = base · Π_r (1 + (w_r − 1) · k)`.
- Example (renowned ghost + Vo's lesson): `0.75 · 0.85 = 0.6375`: a noon witness must be within `23.1 · 0.6375 = 14.7 m`
  to name you, not 23.1.
- Example (known stunt driver, first clear of Wreck Row): `60 · (1 + 0.25 · 0.7) = 70.5` → $71.

## 5. Edge Cases

- **Several roles move on one deed.** Killing a harmless drifter in front of people: butcher +7, samaritan −20, medic −12,
  ghost −6 (named). All apply; each role re-tiers on its own.
- **The chronicle never forgets:** the deputy's tally gate counts records for good (the ring may evict them, the tally
  never does): after four records of killing Rust Haven's people the deputy stays suspended however much renown it has.
- **A gate fails** (deputy wanted 2 stars, Rust Haven standing under 20): the role is suspended - effects off, a toast
  with the reason, `roleSuspended`; renown still earns and wears. When the gate holds again: `BACK IN GOOD STANDING`. A
  role that fades out entirely while suspended is announced fresh next time, not "back".
- **An office's role lapses** (suspended or lost): the office is stripped at once (the tin star leaves your pack, the
  bounty job closes, `RUST HAVEN TOOK BACK YOUR STAR`). Vo's lesson is `lasting`: kept, but idle until you are a ghost again.
- **Renown set under a tier line** (`roles renown=`): the hysteresis still decides; 18 after rumoured stays rumoured.
- **A teleport at the wheel** (more than 90 m in a second): not driving; the odometer skips it.
- **Driving a boat:** counts as the wheel (wheelman km); the rider's km only on a buggy, ATV or bike.
- **Fast time (T, ×40):** roles fade 40× faster in real time - a game week is a game week.
- **The role call's caller dies** before you reach them: the event fails, nothing is recorded against you; the player
  dies: fails; 150 s: times out, a caller far from you walks home. Patched: success, a thank-you, and they walk home.
- **A butcher at a trader:** Ike, Mags and Kenji refuse (dialogue and the counter: `trade.at().refuse`); Doc Reyes
  still treats and trades (she is a doctor).
- **Patching:** no med item, or the person is not hurt (85%+, not bleeding): no choice in the dialogue, and `item on=`
  says why. You can't talk to someone shooting at you, so you can't patch them mid-fight.
- **A heal seen by others:** a normal deed - witnesses carry it (the samaritan grows, a ghost is named).
- **Save/load:** renown, tiers, idle hours, why, jobs, offices, once-a-day favours and the km travel; a pack role row
  travels with the save. On load only the gates are asked again; no toasts. A save from before roles loads with none.
- **A pack role** naming an unknown faction: a warning, ignored until that faction is registered; a purple colour: a
  warning and #b89a5a; an id clash with a built-in row: the pack row is merged over it.
- **Radio news for a role that fades** before the station gets to it: dropped (`peekNews`).
- **Unwitnessed deeds** count 0.35 for most roles (somebody still finds the bodies); the ghost turns it around (nobody saw:
  1, a named witness: 0, and a wear of 6).
- **The selftest** clears every role in its world-memory staging, so nothing the battery did colours a later check.

## 6. Dependencies

| System | What it needs from roles | What roles need from it |
|---|---|---|
| `systems/deeds.js` | `wasHostile(target)` before the witness pass; the idMul perk in `ranges()` | `record()` calls `g.roles.onDeed(rec, o, target, hostile)` |
| `systems/chronicle.js` | — | record flags `K` (named, night, unwitnessed) |
| `systems/factions.js` | `setRoleReading(bias, override)` from `apply()` | `bias`, `roleHostile`, `reading(i)`, `retier`; `purple()` |
| `systems/ai.js` | the deputy's slack (`roles.offices.deputy`) | `hostile()` reads `playerHostile` (role-coloured) |
| `systems/memory.js` | `greet(c)` when there is nothing personal to bark; opinion uses the reading | the `heal` verb remembered as `helped` / `savedKin` |
| `systems/director.js` | `weight(tpl)`, `callFor()`, `radioDigest()`, `peekNews()`/`newsRead()`; `onEvent(ev, outcome)` | the role call template, the hunters' reading, the digest clause |
| `systems/stunts.js` | `perk.jumpPay` | `onJump(res, fresh)` on your landings |
| `systems/inventory.js` | `perk.healMul`; `treat(c)` records `heal` | `onSearch(box)`, `onLoot(value)`; `hurtEnough`, `bestFor`, `handOver` (kits, stars) |
| `systems/trade.js` (WEB_TRADE) | `priceMul(faction, trader)`, `refusal(c)` | `signal('trade', { faction, value, sell })` per deal |
| `systems/skills.js` | `perk.carryKg` | skill levels for `scale` |
| `systems/society.js` | — | the hourly tick calls `tickHours(h)` |
| `main.js` | constructs `g.roles`, `update(simDt)` in the sim step; `carjackFlee`; the deputy's star toast | — |
| `ui/dialogue.js` | `refusal`, `greet`, `lineFor` (strangers); the patch-up choice | — |
| `ui/hud.js`, `ui/qol.js`, `ui/inventory.js` | `version`, `shown(n)`, `view()` | — |
| `data/npcs.js` | role-tagged choices, `roleLines`, `refuseRole` | `jobOpen/jobStart/jobReady/jobPay`, `canSwear/swear`, `daily`, `atLeast` |
| `data/society.js`, `data/items.js`, `data/events.js` | the `heal` verb and its values; `tin_star`; `EVENTS.role_call` | — |
| `agent/api.js`, `agent/content.js` | `roles`, `registerRole`, `item on=`, `simTick`, save/load, pack `roles` and `ifRole`... | `view()`, `register()`, `setRenown()`, `reset()`, `save()/load()` |
| `docs/design/WEB_WORLD_MEMORY.md` | (it names this doc as the layer that reads the world's memory into roles) | deeds, witnesses, factions, memory, the director: the raw material |
| `docs/design/WEB_TRADE.md` | the priceMul contract | the counter, `PRICE_TIER`, `TRADERS` |
| `docs/design/WEB_FAN_SERVICE_BIBLE.md` | — | the names: Stunt Driver, not "Daredevil"; our words everywhere |

## 7. Tuning Knobs

| Knob | Where | Default | Safe range | Affects |
|---|---|---|---|---|
| `soft` | ROLE_RULES | 110 | 90–200 | how slow the top of a role is (≤ 100 makes renowned unreachable) |
| `keep` | ROLE_RULES (or per row) | 0.75 | 0.6–0.9 | hysteresis: how far under a line before the tier drops |
| `grace` | ROLE_RULES | 12 game h | 0–48 | rest before a role starts fading |
| `scale` | ROLE_RULES | [0, 0.4, 0.7, 1] | rising, last = 1 | how much of what a role opens each tier gets |
| `seen` | ROLE_RULES (or per rule) | id 1 · saw 0.6 · none 0.35 | none 0–0.6 | how much an unseen deed builds a reputation |
| `fast` | ROLE_RULES | 22 m/s | 15–35 | what counts as flat out |
| `near` | ROLE_RULES | 150 m | 80–300 | how close to a raided town counts as defending it |
| `sample` | ROLE_RULES | 1 s | 0.5–3 | odometer, gate checks, shouts |
| `biasCap` | ROLE_RULES | 50 | 20–80 | the most all roles together move one faction's reading |
| `priceClamp` | ROLE_RULES | [0.5, 2] | [0.3, 3] | the extremes of priceMul |
| `shoutEvery` | ROLE_RULES | [14, 26] s | 8–60 | how often strangers call your role out |
| `shownOnHud` | ROLE_RULES | 3 | 1–4 | role tapes above the flag |
| `tiers` | per row | [20, 45, 75] | lines ≥ 10 apart, keep × line above the line below | how much doing it takes |
| `halfLife` | per row | 4–14 game days | 2–30 | how fast a role is forgotten (ghost 4, butcher 14) |
| rule `pts` | per rule | 0.02–30 | keep a role reachable in 3–10 deeds per tier | the weight of each deed |
| `opens.factions.*.standing` | per row | ±4..40 | ±50 total per faction | how far a role moves a reading (the rider's 40 is what lets the wolves hold fire) |
| `opens.prices` | per row | 0.85–1.3 | 0.6–1.5 | trade prices |
| jobs `pay`, `need` | ROLE_JOBS | $60–150, 1–3 | $30–300, 1–6 | what a role's work is worth |
| `role_call` | EVENTS | weight 1, cooldown 600 s, timeout 150 s, ring 22–34 m | 300–1800 s, 90–300 s | how often the hurt come looking |

## 8. Acceptance Criteria

All are commands against the running game (`node tools/dl.mjs ...`, `npm run agent` first) or selftest checks; each
passes or fails.

1. **Rows:** `roles` lists ten roles (wheelman, medic, scavenger, deputy, rider, trader, stuntdriver, ghost,
   samaritan, butcher), each with tiers, renown, `why` and `opens`; `registerRole id=x def={...}` adds an eleventh
   with no code (selftest: *a new role is a data row*, earned by a trade with Mags).
2. **Earn by doing:** three hurt drifters patched up through `talk` + `choose` with bandages → medic `rumoured`, a
   `roleEarned` event, the toast `THEY SAY YOU'RE A MEDIC`, a MEDIC tape with one chevron in `hud` (plates.roles), MEDIC
   in the PACK header, three `heal` records in the chronicle (selftest).
3. **Lose by time, with hysteresis:** medic at 22 → `simTick hours=60` → renown 15..20 and still rumoured →
   `simTick hours=120` → tier none, `roleLost`, the toast `NOBODY CALLS YOU A MEDIC NOW` (selftest).
4. **A faction treats you differently:** an armed Dustwolf at −60 is hostile; `roles id=rider renown=50` → not hostile,
   nobody targets you over 2 s of sim, Dustwolf standing still −60 (tier wary), Rust Haven's reading lower, Ike's counter
   (`trade.at`) charges more; renown 0 → hostile again (selftest).
5. **A dialogue option appears because of a role:** Doc Reyes has no "Any work for a medic?" for a stranger; for a
   known medic she does, the kit lands in the pack, three patients later she pays $90 and the job closes for the day
   (selftest). Kenji's stunt-driver job pays $150 after a clean Wreck Row at 18.2 m/s, and the crowd pays more than $60
   (selftest). Okonkwo swears in a known deputy (a star, one star of slack, $20 a Dustwolf) and the star goes back when
   the deputy kills a townsman in front of a bull (selftest).
6. **The director and the radio:** with a known medic `fireEvent tpl=role_call` spawns one hurt stranger who walks
   toward you; patching them ends the event `success`; the next dawn's digest contains the medic's clause (selftest).
7. **Prices contract:** `priceMul('dustwolves')` < 1 for a known rider; `trade.js` calls `g.roles.priceMul(c.fid, c)`.
8. **Save/load:** `save` → `roles reset=true` → `load` restores renown, tiers, jobs and offices (the first role check:
   the medic comes back at the same renown and tier).
9. **Budget:** selftest green on a fresh page twice in a row; `scenario name=stress` draw calls within 2 of the build
   before roles (no new meshes) and the ms/frame within noise; no per-frame allocation (tapes rebuild on `version`).
10. **No purple, no IP:** every role colour's hue is outside 270–320 (`registerRole` with `#8a2be2` warns and uses
    `#b89a5a`); `node tools/ip-lint.mjs` reports 0 deny; `grep -c "^## " docs/design/WEB_ROLES.md` prints 8.
