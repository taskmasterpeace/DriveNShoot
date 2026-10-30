# WEB_CRAFTING: THE MAKER

*Owner lane: crafting (feat/web-crafting). Engine: `web/`. Rows: `web/src/data/recipes.js`, `data/benches.js`, `data/makeritems.js`.
System: `web/src/systems/crafting.js`. Screen: `web/src/ui/craft.js`. Agent: `web/src/agent/crafting-api.js` (the `craft` command).
Status: SHIPPED on feat/web-crafting (2026-10-29), selftest `crafting` x15.*

## 1. Overview

ONE general recipe engine, so every maker item is a row and not a system (depth-plan law 7: tooling over hand-tuning).
Cooking, mending, sewing, forging, handloading and the generators of the next lanes are all rows in `recipes.js`.

Under depth law 2 (the world never regenerates loot) crafting is the honest way scrap becomes stock. So it must never
create matter: every output costs real inputs, taken the moment you start; every tool in the hand wears; time passes on
the game clock; what comes out weighs no more than what went in. The validator enforces that on every row and a selftest
runs every row for real and weighs the pack before and after.

What a recipe is: `{ id, name, group, inputs:[[item,n]], tools:[[tag|item, wear]], hours, skill, minSkill, bench, outputs,
byproducts, noise, learnedFrom, xp }`, plus `mobile` (the tool roll may stand in for the bench) and `effect` (a repair row
that mends or sharpens something you carry instead of making a thing). 67 rows in 10 groups: cloth and rope, medical,
wood, metal, tools, loading, light and fire, traps and bows, repair and edge, meals.

## 2. Player Fantasy

You are the person who can make the thing the world stopped making. You carry a hammer with a taped handle and a file
that is bright where it works, and you know that a broken chair is two planks and a box of nails if you have the table.
The hatchet you forged at Kenji's anvil comes out better at skill 60 than at skill 20, and you can feel the tool you
brought wear down toward the day it snaps. Reading the Smith's primer in a dead man's garage is how you learn to make a
hatchet; the recipe is greyed in your list until then, with the name of what teaches it. A bench is a place, and
places are owned: a forge is Kenji's, and when Kenji is asleep it is shut.

## 3. Detailed Rules

**Making.** `craft make id=` (or E in the CRAFT tab). It checks everything (knowledge, skill, inputs, tools, bench, queue
room, the keeper's fee) and refuses with EVERY miss named, changing nothing. On success: inputs are consumed at once from
the pack, then the trunk of the car at your side; tools lose their `wear` condition (a tool at 0 breaks and is gone); the
fee is paid; the job joins the queue (max 6); loud recipes `noise` the area at start. The head job works on the GAME
clock (its progress is the clock's hours); walking off its bench PAUSES it (`WAITING AT THE BENCH`); `instant` passes the
hours at once (agents, the crew). Cancelling hands the same inputs back (nothing was made); the tool keeps its wear.
Finishing: outputs and byproducts go into the pack, spilling to the trunk then the ground (`inventory.stow`); a durable
output (`dur` items: tools) takes the quality below; the maker gains skill xp.

**Benches** (`data/benches.js`). `hand` is anywhere. `campfire`: a fire within 4 m (a flare, a pit, a burning car; the
camps lane registers more through `crafting.addProvider`). `placed` benches (workbench, anvil and forge, sewing table,
camp stove, reloading press, chem table) are items you carry and SET DOWN with `craft place` (they leave the pack and stand
in the world, a small block with a vise, up to 3 per kind, 2.4 m apart) and pick up again. Town benches are a keeper's:
Kenji's yard (workbench, forge), Ike's back room (reloading), Mags's stove (kitchen); the keeper must be alive, awake, not
refusing you, within range; they charge a fee per bench hour (x their price for you), refused if you cannot pay. A TOOL
ROLL in your pack or trunk stands in for a bench on `mobile` recipes only.

**Learning.** `learnedFrom`: `default`; `skill` (known the moment you have `minSkill`); `perk:<skill>:<tier>`;
`book:<item>` (read a manual: `use` act `learn`; the manual stays, so it can be lent and sold). The books lane's hook is
`crafting.knowRecipe(g, id)` (also `craft learn id=`). Unknown recipes stay in the list greyed, italic, with what teaches
them. Skills are the deep sheet's (carpentry, fabrication, mechanics, cooking, firstaid, chemistry, hunting, salvage);
metalworking, handloading and gunsmithing all ride `mechanics` (there is no separate smith skill in the sheet).

**Repair rows** make nothing: `['sharpen', tag, amt]` restores a worn blade, `['mend', tag, amt]` a worn tool,
`['mendgear', amt]` worn gear carried in the pack (nothing in the game wears gear yet, so it says "nothing needs patching";
it is the hook for a gear-wear system). Existing tools get a `cond` the first time a recipe wears them.

**Crew.** A crew job row may name a `recipe`; `crewRun` eats that row's inputs and delivers its outputs. CRAFT AMMO now runs
`load_pistol`: spent brass, powder, primer and lead. The old "one scrap makes eight rounds" row is gone (that was
matter from nothing).

**Where the raw stock comes from.** Additive, rare rows in the existing loot tables (`MAKER_LOOT_ADD`): nails and tools in
garages, cloth in bedrooms and bathrooms, powder, primers and brass at the gunsmith, plant fibre in the desert. Three
manuals are in a few tables. Nothing is made by the world; breaking things down (`break_planks`) is the other source.

**Hooks other lanes can use.** `crafting.addProvider((g) => [{ bench, x, z, reach?, owner?, fee? }])` (a base's furniture);
`crafting.knowRecipe`; `crafting.make` / `crewRun` / `assess`; `validateRecipes(rows, { items, skills, benches })` for the
World Forge; item rows flagged `dur` carry `cond`.

## 4. Formulas

Variables: `skill` 0..100 (the deep sheet's value for the recipe's skill); `minSkill` 0..100; `hours` 0.1..5; `wear` 0..0.5; tool condition 0..1; `kg` per item from `items.js`.

- **Time:** `hours_eff = hours x (1 - speed x min(1, skill/100))`, `speed` 0.4.
- **Quality of a durable output (its condition):** `q = qMin + (1 - qMin) x clamp((skill - minSkill)/qSpan, 0, 1)
  + qBench (if the bench is the recipe's own, not by hand) - qTool x (1 - worst tool condition)`, clamped 0.05..1;
  qMin 0.45, qSpan 60, qBench 0.05, qTool 0.1. Quantities never scale with skill (that would be matter).
- **The matter rule:** `sum(kg of outputs + byproducts) <= sum(kg of inputs) + 0.02` for every non-effect recipe, and
  every non-effect recipe must have inputs. Checked by `validateRecipes`, and again at run time by the selftest.
- **Town fee:** `fee = keeper fee x hours_eff x (keeper price multiplier x your haggling)`.
- **XP:** `xp x (1 + hours x 0.2)` into the recipe's skill.

**Worked example:** a hatchet (`forge_hatchet`: scrap, salvage timber, charcoal; hammer and file; forge; minSkill 20;
3 h; xp 10) forged at the anvil at Mechanics 60 with a hammer at 80% and a file at 90%:
`f = (60-20)/60 = 0.667`; `q = 0.45 + 0.55 x 0.667 + 0.05 - 0.1 x (1 - 0.80) = 0.847`, so an 85% hatchet; time
`3 x (1 - 0.4 x 0.6) = 2.28 h`; the hammer drops 4% and the file 2%; xp `10 x (1 + 3 x 0.2) = 16`. It leaves one scrap
(an offcut). At Mechanics 100 the same hatchet is 100%; at 20, 50% (on a new tool). Mass in: 1.5 + 2 + 0.3 = 3.8 kg; out: 1.1 +
1.5 = 2.6 kg. The rest burned.

## 5. Edge Cases

- A refusal changes nothing and names every miss; a full queue, too little cash for a keeper's fee and a missing tool are misses like any other.
- A tool that breaks mid-queue is gone for the NEXT make (a refusal says "a tool: ..."); the job already queued completes.
- Walk away from the bench: the job pauses, it is never lost. Cancel: inputs come back, wear and noise stay.
- A keeper asleep, dead, downed or refusing you closes their bench; a job already started at their bench pauses.
- A placed bench cannot be picked up while a job runs at it.
- Outputs that do not fit spill: pack, then the trunk beside you, then the ground (a NO ROOM toast).
- Stacked tools are never worn (only stack-1 things carry a condition); the recipes use only stack-1 tools.
- A recipe whose book you read twice teaches nothing the second time; reading never uses the manual up.
- A save mid-job keeps the job (inputs already spent, bench by id); a load re-stands the placed benches.
- A recipe that names an item that no longer exists is dropped on load (queue and learned list are filtered).
- Multiplayer: not synced (a bench is yours); the world's benches are the keepers' and the base lane's.

## 6. Dependencies

**Reads:** `items.js` (every row is items), `inventory.js` (`add`/`take`/`stow`, slot `cond`), `stats.js` (skills, perks via
`g.deep`), `workshop.js` pattern for keepers, `throwables.fires` and burning vehicles (campfire), `society.memory.refuses`
and `roles.priceMul` (keepers), `sky.time` (the clock), `g.noise`.
**Read by:** `crew.js` (the `ammo` job's recipe), `inventory.js` (acts `learn` and `mendgear`, the `cond` tag, `keep`),
`ui/inventory.js` (the CRAFT tab, tool condition on rows), the snapshot/restore (`crafting` section), `agent/api.js`.
**Others:** farming/cooking lane: add rows to the `meals` group and items to `MAKER_ITEMS` (or its own file merged with `??=`).
Camps/bases lane: `addProvider` for its furniture; its fortify costs already name `planks` and `scrap`, which this lane
makes (`make_planks`, `plank_barricade`, `metal_barricade`). Calibers lane: ammo rows name `ammo_pistol|smg|rifle|shells`;
when it renames rounds, edit four `load_*` rows. Books lane: `knowRecipe`; give a book `use: { act: 'learn' }, keep: true,
learns: [ids]` and the matching recipes `learnedFrom: 'book:<id>'` (validated both ways). Timed-actions lane: not merged at
the time of writing; the queue runs on the clock behind `crafting.update`, so adopting its action runner means replacing the
body of `update` and `skip`, nothing else. Gear wear (nobody's yet): `mendgear` is waiting for it.

## 7. Tuning Knobs (`CRAFT_RULES`, `PLACE_RULES`, row fields)

| Knob | Now | Safe range | What it moves |
|---|---|---|---|
| `qMin` | 0.45 | 0.2-0.7 | worst made-tool condition |
| `qSpan` | 60 | 30-100 | skill points from worst to best |
| `qBench` | 0.05 | 0-0.15 | reward for a proper bench |
| `qTool` | 0.1 | 0-0.3 | penalty for a worn tool |
| `speed` | 0.4 | 0-0.7 | how much skill shortens work |
| `xpHours` | 0.2 | 0-0.5 | xp from long jobs |
| `slack` | 0.02 kg | 0-0.05 | rounding forgiven by the matter rule (keep tiny) |
| `townPerHour` | 1 | 0.5-3 | scale of keepers' fees |
| `queueMax` | 6 | 1-12 | jobs waiting |
| `PLACE_RULES.minApart` / `maxPerBench` | 2.4 m / 3 | 1.5-4 / 1-6 | how benches sit |
| a row's `wear` | 0.004-0.08 | 0-0.5 | how fast the tool dies (0.02 = 50 makes) |
| a row's `hours` | 0.1-5 | > 0 | game hours (60 s of real time each) |

## 8. Acceptance Criteria

Selftest (`node tools/dl.mjs selftest only=crafting`, 15 checks), each of which proves:

1. rows validate: 67 recipes, benches, manuals; every non-effect row passes the matter rule; all groups used.
2. the validator catches 11 kinds of bad row (unknown item, no time, matter from nothing, matter gained, bad learning, an untaught book, an unknown tool/bench/skill, nothing made, fractional input) and a duplicate id.
3. a make eats exactly its inputs, wears the tool by exactly its wear, passes the clock, leaves byproducts, and the pack weighs no more.
4. a refusal names the exact miss (tool, input, bench, knowledge, skill) and changes nothing.
5. a tool breaks at zero and is gone; a recipe needing it is refused.
6. quality follows the formula at skill 20, 60 and 100.
7. a set-down bench is the only thing that allows planks; work pauses when you walk off; pick-up returns the item; a block stands in the world.
8. Kenji's forge is a town bench for a fee; asleep, it is shut; a tool roll stands in only for `mobile` recipes.
9. unknown recipes are listed with their teacher; a manual teaches once and stays; `knowRecipe`; skill gate.
10. learned recipes, placed benches and the queue survive save/load; the full snapshot carries the section.
11. progress is the game clock; cancel returns the same inputs; a loud recipe is heard at its radius.
12. a whetstone restores the worst blade by its amount and wears itself.
13. NO recipe creates net matter: every row run for real leaves the pack no heavier.
14. the crew's CRAFT AMMO eats brass, powder, primer and lead; scrap alone makes no rounds.
15. the CRAFT tab opens from PACK, files by group, marks makeable rows, shows misses and teachers, queues with a progress bar.

Also: full selftest green twice, `scenario name=stress` not regressed, golden hashes unmoved, ip-lint 0 deny, no purple,
screenshots in `docs/renders/web/crafting/` (`node tools/craft-shots.mjs`).

**Not done (and why):** gear wear (nothing wears yet, so `mendgear` has no target in play); the bow and arrow rows are
stubs (no bows in the arms); the timed-actions lane's runner (not merged: the queue is the swap point); calibers lane
rows (not merged); a forge-side authoring tab (the validator is exported for it; the tab is the World Forge lane's).
