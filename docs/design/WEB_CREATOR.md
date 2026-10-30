# WEB_CREATOR: THE CREATOR, point-buy survivors

Robert's settled call (EM3 Briefing, WEB_WORLD_EDITOR_PLAN.md §1.1): new characters are made by **point-buy**, "the
creator system from my superhero game". This is that creator's structure carried into the Divided States, where
nobody has powers: what you buy is a body, a past, a few good habits, at least one flaw, and where you are from.

- Rows: `web/src/data/creator.js` (the pool, attributes and their rank ladder, backgrounds, traits and flaws, states,
  the look, the start). System: `web/src/systems/creator.js` (the draft, BEGIN, the sheet, save and load). Screen:
  `web/src/ui/creator.js` + `creator.css`. Agent: `web/src/agent/creator-api.js` (`creator`, `sheet`, 10 selftest checks).
- Renders: `docs/renders/web/creator/` (`web/tools/creator-shots.mjs` makes them in a real Chrome, the DOM included).

## 1. Overview

On the title, **MAKE A SURVIVOR** (pad A) opens the screen; **QUICK START: A DRIFTER** (pad X; it is the old
`.play` button, so `start`, the agent's `?agent=1` and the shard's PLAY OFFLINE are unchanged) still drops you in as the
engine's default drifter. The screen has six steps, each a stamped-steel plate of rows with a typed paper under it,
beside a card that shows the REAL in-engine body (the game's own `CharacterRenderer` on a small canvas) turning in
front of your country's flag:

1. **NAME & ORIGIN**: a name (typed, or rolled off the road), a country (the 18 flags the game draws for real), a home
   state (the 50, each with its ruler from `data/atlas.js` RULERS).
2. **BACKGROUND**: ten pasts (long-haul driver, line cook, gate guard, field medic, mechanic, road preacher, scav kid,
   bounty hunter, convict, grove hand). Each gives skill levels, a kit, and a *knowing*: who in the world knows you.
3. **ATTRIBUTES**: six on a named ladder (SOFT, ORDINARY, CAPABLE, HARD, RARE, ONE IN A THOUSAND), each rank dearer.
4. **TRAITS**: 14 good traits that cost points and 13 flaws that pay them back. Everybody takes at least one flaw.
5. **LOOK**: build, skin, hair or hat and its colour, face (goggles, dust mask, eyepatch), a scar and the story it tells,
   shirt, trousers, boots, sleeves.
6. **KIT**: what you carry, who knows you, and every number the picks move; **BEGIN**.

BEGIN makes the player from the rows: skill levels, the pack and its contents, guns and rounds, gear worn, the look and
build on the body, the flag and a stitched name tape on the HUD, max hp, standing and memories. The picks become
`g.sheet` (and `sheet` in every save and in the shard's character record); one consumer per number reads it.

## 2. Player Fantasy

You are somebody before the first shot. A Haitian-born mechanic out of Florida with a bad back and a sour face walks
into Rust Haven and Kenji already knows her, Mags warms to her accent, and her wrench work holds better than anyone's.
A convict starts strong and broke, and the Dustwolves are a little less keen to kill him because his cellmates ride with
them, while Ike wants his money. Nothing is a class you are locked into: the skills still grow by doing, roles are still
earned; the creator only says where you start and what you are bad at. The flaw is the point: it is how you will die.

## 3. Detailed Rules

### 3.1 The pool and the ladder
- One pool, `CREATOR.pool` (30) for everyone (a shard is fair). Points left at BEGIN are scrip (`scripPerPoint`, 4 each).
- Six attributes start at rank 2 (ORDINARY; 2 points each held, 12 of the 30) and run 1-6 at creation. Holding rank r
  costs `ATTR_COST[r]` = 0, 0, 2, 5, 9, 14, 20 (cumulative). A raise is refused, with nothing changed, if it costs more
  than is left; a lowering always gives back exactly that rung's cost.
- STRENGTH, ENDURANCE and DEXTERITY *are* the engine's three body skills (`systems/skills.js`): they start at rank - 1
  plus the background's levels, and keep growing by doing (to 10). PERCEPTION, WITS and NERVE exist only on the sheet.

### 3.2 Backgrounds
Free, one each. Rows carry `skills` (levels), `kit` (pack, items, guns with rounds and condition, gear worn,
throwables, cash) and `knowing` (faction standing, one named person's memory of you, renown under a role's first tier,
and the line the KIT page reads). Every background carries a gun: the engine has no empty hands yet.

### 3.3 Traits and flaws
- A good trait costs its `cost`; a flaw refunds its `refund`, capped at `refundCap` (12) in total.
- At most `maxGood` (4) good traits and `maxFlaws` (3) flaws; at least `minFlaws` (1) flaw.
- A trait's `not` list names what it cannot sit beside (IRON GUT and BIG APPETITE). Refused when picked.
- MARKED is the one flaw with a knowing: the Dustwolves' standing drops 30 (from -60 to -90, *hunted*).

### 3.4 Where you are from
- The country is a flag `ui/portrait.js` FLAGS draws (never letters). The named people who share it remember you
  warmly (memory `traded`, weight `COUNTRYMAN` 3): Mags for Haiti, Kenji for Japan, Reyes for Mexico...
- The home state is identity and papers. A survivor from the start's own state (`START.state`, AZ while the engine
  starts in Phoenix) is a local: +5 with the start town's faction.

### 3.5 Consumers (one each; no sheet = every number is 1 or 0)
| Number | Read by | Where |
|---|---|---|
| skill levels | strength carry, endurance sprint drain, dexterity spread + reload | `skills.js` (levels set at BEGIN) |
| `carryKg`, `spreadMul`, `reloadMul`, `sprintDrainMul`, `speedMul`, `nightSpreadMul` (after dark) | the movement and combat multipliers | `skills.js recompute()` |
| `seenMul` | how close a hostile must be to spot you | `gear.seenMul()` -> `ai.js` scan |
| `repair` | repairs | `gear.repairMul()` -> `inventory.js` |
| `luck` | extra rolls on a box's first search | `gear.luckRolls()` -> `inventory.js` |
| `priceMul` | counter prices | `trade.js at()` |
| `drain.water/food/rest` | need drains | `survival.js update()` |
| `wakeMul` | the sleep wake radius | `survival.js update()` |
| `hp` | max hp | the player, at BEGIN and on load |

### 3.6 The look
The body's own options (`characters.js` outfit shape): skin, hair colour, hair or hat style (a hat hides the hair and
takes the hat colour), face accessory, shirt, trousers, boots, sleeves. Two additions to the renderer: **build** scales
the body's root (`w` across, `h` tall; lean to heavy, short to tall), and **a scar** (brow, cheek, jaw) is a packed
variant drawn paler than the skin, one draw call only while somebody wears one. Gear worn still shows over the look
(`gear.dress()`; its remembered base look is reset when the look changes).

### 3.7 The screen
Pad first: d-pad or left stick moves and changes (repeat after 0.34 s, every 0.11 s), A picks, B goes back a step (and
out from step 1, unless the shard made the character), LB / RB change steps, Y randomizes inside the budget, X rolls a
name (on LOOK: a whole new look), START jumps to KIT and, there, begins. The keyboard: arrows or WASD, Enter / Space,
Esc / Backspace, Q / E (or PageUp / PageDown, Tab), R randomize, F roll. The mouse: every row, arrow, tab, flag and
button. While it is up the game is paused and its keys go nowhere (a capture-phase listener). The pad is read straight
from `navigator.getGamepads()` (or a virtual pad: the `creator press=` command, or the controller layer's
`g.controls.virtual`), so it works with or without the controller lane.

### 3.8 BEGIN, saves and the shard
- BEGIN validates; on any error it stays and says the first one. Then: identity and look, skills (xp 0), an empty pack
  of the background's kind and its things, guns loaded (the rest of the rounds in your pockets), gear worn, scrip, the
  knowing, full hp, and the start place (`START.place`, null = where the engine starts now) or `g.creator.onStart`.
- `snapshot()` writes `sheet` (null without one); `restore()` applies it before your hp. A save from before the
  creator (no `sheet` key) leaves you as you are; `sheet: null` returns you to the default drifter.
- The shard's character record is additive: the page's `personal()` now carries `sheet` and `gear` (and
  `sheetPending` while a shard character's creator is unfinished) inside the opaque `data` the server already stores.
  No server change. With `CREATOR.shardNew` on (or `?creator=1`), a character the shard just made (a name and a flag)
  opens THE CREATOR on entering, its name and flag held, and BEGIN saves to the shard.

## 4. Formulas

Variables: `r_k` the rank of attribute k (1-6); `T` the set of traits; `B` the background.

- Spent = Σ_k ATTR_COST[r_k] + Σ_good cost − min(refundCap, Σ_flaw refund); Left = pool − Spent; BEGIN needs Left ≥ 0.
- Skill level (strength, endurance, dexterity) = clamp(r − 1 + B.skills[k], 0, 10).
- Max hp = 100 + 4 (r_END − 2) + Σ trait hp.
- Wake radius = 12 m × (0.8 + 0.1 r_PER) × Π trait wakeMul. Luck rolls = (r_PER ≥ 6 ? 2 : r_PER ≥ 5 ? 1 : 0) + Σ trait luck.
- Price × (1 − 0.02 (r_WIT − 2)) × Π trait priceMul. Repair + 0.05 (r_WIT − 2) + Σ trait repair.
- Night spread × (1 + 0.05 (2 − r_NRV)) × Π trait nightSpreadMul (applied when `sky.night` > 0.5).
- Scrip at BEGIN = cashBase 60 + B.kit.cash + 4 × Left.

**Worked example** (the renders): Mara Quill, Haiti, Florida, MECHANIC. STR 4 (9), END 3 (5), DEX 2 (2), PER 2 (2),
WIT 3 (5), NRV 2 (2) = 25. TINKER 3; BAD BACK +4, SOUR FACE +3 (refund 7). Spent = 25 + 3 − 7 = 21, Left 9.
Skills: STR 4−1+1 = 4, END 2, DEX 1. Max hp 100 + 4 = 104. Carry 24 + 3.5·4 − 6 = 32 kg. Repairs +0.1 (the wraps)
+0.05 (WIT 3) +0.12 (TINKER). Prices × 0.98 × 1.06 = × 1.04. Scrip 60 + 15 + 36 = $111. Knowing: Rust Haven +4,
Kenji `helped`, Mags `traded` (a countryman).

## 5. Edge Cases

- **Overspend**: every raise and trait goes through `Creator.setRank` / `setTrait`, which refuse (ok false, nothing
  changed) when the cost exceeds Left; `validate()` also refuses BEGIN when over. Randomize checks each buy first.
- **Refund cap**: a fourth flaw is refused (max 3); three flaws worth 13 pay back 12.
- **Clashing traits**: refused at pick time with "X and Y cannot both be true"; a hand-edited save with a clash still
  loads (`cleanPicks` keeps known ids; the numbers just multiply).
- **Unknown ids in a save or the shard record**: dropped by `cleanPicks`; ranks clamped to 1-6; a missing look key
  takes the default.
- **A flag the game cannot draw**: refused by `set`; on load it falls back to US for the body's flag.
- **No WebGL for the preview**: the screen still works (`noPreview`), without the turning body.
- **Opening twice**: one preview renderer for the page's life (a context made and lost per open broke the second open).
- **The shard character**: name and flag are held (`set` reports them ignored); B on step 1 does nothing; leaving
  before BEGIN keeps `sheetPending`, so it opens again at the next login.
- **Quick start**: no sheet at all; every consumer reads its default (the battery's other checks see no change).
- **A save from before the creator**: no `sheet` key: you stay who you are. `sheet: null`: the default drifter look.

## 6. Dependencies

Reads: `data/skills.js` (the three skills), `data/items.js` (kit rows), `data/gear.js` (worn rows), `data/npcs.js`
(named people and flags), `data/atlas.js` RULERS, `data/society.js` (factions, memory kinds), `data/roles.js` (role ids),
`ui/portrait.js` FLAGS / drawFlag, `ui/hudart.js` paintClothFlag, `systems/characters.js` (the body and renderer),
`systems/combat.js` WEAPONS.

Writes into (each one line, listed in the hand-back): `skills.js` recompute (fx multipliers), `gear.js` seenMul /
repairMul / luckRolls, `survival.js` (drain, wake radius), `trade.js` (priceMul), `characters.js` (build scale, scar
variant), `main.js` (construct), `agent/api.js` (commands, checks, snapshot/restore), `net/shard.js` (record + hook).

The card's body is the faceted body the world draws (`WEB_LSW_BODIES.md` rule 10): the preview's LswBodies gets a
focus, the draft's name and flag, the world's body mode, and the background kit's worn look through `systems/gear.js
wornLook` (the same function BEGIN's `dress()` runs).

Depended on by: the Florida start lane (`START.place` / `START.state`, `g.creator.onStart`); the controller lane (its
virtual pad is read here); the shard lane (`CREATOR.shardNew`, `forShard`); roles (renown head starts).

## 7. Tuning Knobs

| Knob | Now | Safe range | What it does |
|---|---|---|---|
| `CREATOR.pool` | 30 | 24-40 | how much of a person you buy |
| `ATTR_COST` | 0,0,2,5,9,14,20 | keep convex | how dear a high rank is |
| `scripPerPoint` | 4 | 0-8 | what saving points is worth |
| `cashBase` | 60 | 30-150 | everyone's walking-out money |
| `maxGood` / `maxFlaws` / `minFlaws` | 4 / 3 / 1 | 3-6 / 2-4 / 0-2 | how lopsided a build can get |
| `refundCap` | 12 | 8-15 | how much flaws can buy |
| `PER_RANK.*` | see rows | ±50% | each attribute's reach |
| trait `cost` / `refund` / `fx` | rows | fx within ±20% | one number each |
| `COUNTRYMAN` | 3 | 0-6 | how warm a countryman starts |
| `START` | AZ, +5 | any state | who counts as a local, and where you wake |
| `shardNew` | false | bool | the creator for shard-made characters |

## 8. Acceptance Criteria (the selftest checks, `selftest only=creator`)

1. Point-buy never overspends (raises until refused, Left never negative, the books balance) and a refund gives back
   exactly the rung's cost; a straight jump to rank 6 it cannot pay for changes nothing.
2. A flaw pays back 4, removing it takes 4 again, a good trait costs 5, clashes and a fourth flaw are refused, the
   refund caps at 12, an unaffordable trait is refused.
3. Randomize lands inside the budget with 1-3 flaws on 200 seeds.
4. BEGIN makes the player from the rows: skill levels, pack contents, gun loaded and rounds, gear worn, colours, scar
   (drawn), build, flag on the body and the HUD, the name tape, max hp, carry and repair numbers, faction standing,
   two named memories, scrip.
5. The made character survives a JSON save/load round trip; an old save keeps you; `sheet: null` clears you.
6. Each trait moves its one consumer: carry, speed, reload, spread, seen, repair, luck, food drain, and the night spread
   after dark; counter prices at a real trader.
7. A heavy sleeper sleeps through an infected 10 m off that wakes a light sleeper.
8. The pad alone makes a character: name rolled, flag, state by stick, background, two ranks, a good trait and a flaw,
   a look, START to KIT, START to BEGIN.
9. The sheet rides the shard's character record and comes back; a shard character opens with name and flag held, B does
   not leave, BEGIN finishes it.
10. The keyboard alone: steps, arrows, Enter, Escape backs out and closes.

Plus the whole battery green twice on fresh pages, under 150 draw calls, `ip-lint` 0 deny.

## What came from LSW's ORIGIN, and what changed

Borrowed (D:/lsw `src/data/creator.js`, `src/engine/creatorUI.js`, `src/data/ranks.js`; structure only, no code or
names): one points pool and a live points counter that colours as it runs low; attributes on a named rank ladder with
cumulative, escalating costs (`ATTR_COST`); catalogs of rows that each cost points with caps on how many you take
(talents max 3, gadgets max 2 there; good traits max 4, flaws max 3 here); `tally()` breaking the spend down by kind;
`validate()` as the save gate whose strings are the screen's errors; `freshPicks()` / `buildDef()` turning picks into
the plain thing the engine runs (here `begin()` into the player); a homeland with a real flag and a dossier that tells
you what that origin means in the world; the live sheet beside the picks.

Changed: no superpowers, flight, guards, evades, ultimates or threat rating, so the power slots became backgrounds and
kit; LSW's "gifts" became traits that cost **and flaws that pay back** (with a cap and a minimum of one: everybody has a
flaw); the budget tiers (Street to Cosmic) became one pool, because a shard is shared; the three-column single page
became six steps with a pad-first focus model; the LSW preview of a painted fighter became the game's own body
renderer turning in front of the flag; unspent points become scrip instead of being wasted.
