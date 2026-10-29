# WEB_OCCUPATIONS: the work of a settlement, and the goal loop that tuned it

Lane ROLES-DIVERSITY + GOAL LOOP (Wave 2 of `WEB_DEPTH_PLAN.md` §2, §5). Branch `feat/web-roles`.
Code: `web/src/data/occupations.js` (the rows + `validateOccupations`), `web/src/world/occupations.js` (the pure mix),
`web/src/systems/workforce.js` (the people), `web/src/agent/roles-api.js` (`town action=…` and the checks),
`web/tools/role-diversity.mjs` (the metric), `web/tools/occ-check.mjs` (the guard), `web/tools/goal-loop.mjs` + `web/tools/goals/role-diversity.json` (the loop),
`.claude/skills/goal-loop/SKILL.md`. Log: `docs/design/goal-loop-log/role-diversity.md`. Renders: `docs/renders/web/roles/`.

Not to be confused with `WEB_ROLES.md`: those are what the world calls *you* (medic, deputy, stunt driver). These are
what the world's own people *do for a living*.

## 1. Overview
Robert: "our role system need to be improved to have more diversity, bro, in the different cities, different places...
improve our algorithm... build a loop system. Like imagine dream loop, but for a process. You set a goal and you have it
keep going back until it reaches that goal."

Three parts:
1. **Occupations as rows.** 68 jobs (67 drafted, the harvest crew added by the loop). Each says where it is worked (building kinds, a site's hero structure, or an open-air
   spot), its shift, what the worker carries, what the work makes (an `ITEMS` id, the work hours per unit, the most a
   workplace keeps), what kind of place it fits, who it serves under, and three things the worker says about it.
2. **A town's mix is a pure function** of its plan record (archetype, biome, its SITE row: kind, what it makes, its hero
   structures, its water), who holds it, its wealth and its size. Every one of the 246 peopled settlements in the
   planned country (17 generated towns, 229 sites) gets a different workforce, and a built town's workers walk to work on
   their shift and do visible work there.
3. **The goal loop** pushes a measured quality to a target by repeated one-row changes, each kept only if the number
   rose and the checks stayed green. Its first goal is role diversity.

**The goal loop's first result** (`docs/design/goal-loop-log/role-diversity.md`): the first-draft rows scored **0.9634**
(220 of 246 settlements met all three criteria; 3 had one job over 25%, 24 were too like their same-kind neighbour).
Twenty stepwise rounds (15 by a Sonnet subagent, 5 by the lead; 11 kept, 9 rejected, 3 of those by the guard) and two
algorithm changes by the lead (the seeded tail, core trades exempt) reached **1.0**: 246 of 246, min Shannon 1.889, mean
2.717, worst share 0.25. The headless run (`--agent "claude -p"`) could not run on this machine (the org refuses CLI
subscription access to a child process); the log keeps that run too.

Which of scarcity, distance and consequence it makes bite harder:
- **Scarcity:** goods come only from hours actually worked (law 2). A fishing town has smoked fish because its fishers
  stood at the water for it; kill the fishers and the shelf stays empty.
- **Distance:** places now differ by what they make. The swamp has gator hides and corn liquor, the oil field fuel,
  the pueblo water jars, the armory reloads: what you need is somewhere particular.
- **Consequence:** a dead worker stays dead in the record; their job goes unworked when the town is built again.

## 2. Player Fantasy
You walk into a gulf port at half past nine. Three dockhands are working the warehouse's loading bay; the harbourmaster
stands outside the office block; a crabber is coming back along the waterside; the cook at the diner has been at the
griddle since five. Ask the cook what she has made and she tells you how many flatbreads are on the shelf, "every one of
them worked for". Drive two hours inland to a mining camp and nobody there mends a net: the diggers come up at six, the
powder man keeps his fingers, and the company store clerk tells you everybody owes the store.

## 3. Detailed Rules
### 3.1 A row (`OCCUPATIONS` in `data/occupations.js`)
`name`, `at` (citygen `KINDS`), `hero` (regex over a site's structure names), `out` (`street | edge | gate | dock | field`),
`shift [from, to]` (to < from runs past midnight), `carry` (ITEMS ids; a `gun_*` arms the worker), `makes [item, hours, cap, label]`
or `deals` (trade kinds), `fit {tag: weight}`, `needs` (any of), `bans`, `fac {class: factor}` (0 = never), `wealth [lo, hi]`,
`minN` (smallest workforce that has one), `one` (at most one), `max` (share cap), `talk` (3+ lines).

### 3.2 A settlement's profile (`profileOf`, pure)
- **Tags** from its archetype (`ARCH_TAGS`), biome (`BIOME_TAGS`), its site row's kind (`SITE_KIND_TAGS`), what its row makes
  (`MAKES_TAGS`, by word: clams → fishing, moonshine → still, slaves → slaving), its hero structures (`HERO_TAGS`: a pier → port,
  a headframe → mine), its water (`terrain.water`: sea, river, lake), Florida, and raiding if raiders hold it.
- **Class** (who holds it): a site by its faction's name (`FACTION_CLASS`: raider, warlord, garrison, cult, merchant,
  company, else free); a generated town by its archetype (`TOWN_CLASS`; a seeded chance that raiders hold a crossroads).
- **Wealth**: archetype (towns) or site kind (`SITE_WEALTH`), ±0.15 seeded. **Pop**: the archetype's or row's range, seeded.
- **Workforce** n = clamp(round(pop × `workShare`), `minWorkers`, `maxWorkers`). Settlements whose most people are fewer
  than `minPop` (dead ruins) have none.
- **Workplaces it has**: its archetype's building kinds, its hero structures' kinds; **spots**: street and edge always,
  gate (walls or a hold), dock (water), field (land that is worked).

### 3.3 The mix (`mixOf`, pure)
A job is in the running only if its `needs` are met, no `bans` hit, the workforce is at least its `minN`, and the place
has a workplace for it. Its score (§4) shares out the workforce under caps, then whole people by largest remainder.
**The tail**: in a workforce of at least `MIX.tailFrom`, a job that would keep fewer than `MIX.tailN` people is present
only with chance `MIX.tailKeep` (by the seed), unless it is `one` (a post) or CORE (its fit to the place times its holder
factor is at least `MIX.tailCore`: the mine's diggers, the raiders' scouts, the base's sentries). Not every farm town has
a beekeeper; every mine has diggers.

### 3.4 The people (`systems/workforce.js`)
- **Books**: a built town's roster (pure) becomes worker records with a name (the ring's name pools), a real flag
  (`randomFlag`), a seeded outfit, a workplace picked from the built town's own buildings (the spot outside the door,
  facing it; workers of one place stand apart) and a home (a house, rowhouse, stilt house, trailer… of the town).
- **Promote** (every 0.5 s): workers within 170 m of you in a built town, nearest first, never more than 24 at once and
  never into the last 28 character slots. They appear where the clock says: at work on shift, at home off it.
- **Think** (ai.js asks first): on shift, foot-path to the workplace and work there (the rig's `work` pose, facing the
  job); off shift, walk home and stand down. A fight, a scare, a follower order or a talk belongs to the ordinary AI.
- **Produce**: each tick, a living worker standing at their workplace, on shift, banks the game hours that passed (at
  most 1 h a tick: a skipped clock does not pay a shift nobody saw). Every `hours` banked is one unit into the
  workplace's stock, up to `cap`; a full shelf stops the banking. `take()` is the only way out.
- **Demote** past 240 m or when the town is torn down: alive, hp and hours go back to the record. The dead stay dead.
- **Talk**: the dialogue asks after the pulls: a line about the work by the hour, "What do you do here?", and for a maker
  "What have you made lately?" (the real stock).

### 3.5 The goal loop (`tools/goal-loop.mjs`; skill `goal-loop`)
A goal is a row (`tools/goals/<name>.json`): metric command (last line a number), target, direction, the files it may
change, the checks, a brief and a `--fails` detail command. Each round: measure → met? stop → snapshot the files → ONE
change → checks → re-measure → keep if it rose and checks are green, else restore byte for byte → log. Two ways to
drive it: `--agent "<cmd>"` (a headless editor reading the prompt on stdin) or the stepwise `--begin` / `--judge` /
`--abort` (any agent edits between the two calls). A change outside the allowed files is never kept.

## 4. Formulas
**Score** of job j in settlement s:
`w = (base_j + Σ_{t ∈ tags_s} fit_j[t]) × fac_j[class_s] × (wealth_s ∈ wealth_j ? 1 : offWealth) × exp(jitter × (2u − 1))`,
u = hash(seed_s, j) in [0, 1). **Shares**: water-filled under each cap (`one` → 1/n, else `max` ?? `MIX.cap`); **counts**:
floors, then largest remainders, never over a cap's whole count unless nobody else can take one.
**Shannon** H = −Σ p ln p over job shares. **Neighbours**: the nearest settlement with the same key (`town:<arch>` or
`site:<kind>`) within 80 km; Jaccard distance of the two job sets. **Score** of the goal = (#H ≥ 1.6 + #max share ≤ 25% +
#neighbour distance ≥ 0.3) / (3 × settlements).

*Example (the test port, `port_wharf`, gulf coast, seed 4417):* pop 74 → n = round(74 × 0.55) = 41. Tags coast, fishing,
port, sea, water. Dockhand: base 0.4 + port 2.2 + fishing 0.5 = 3.1, × jitter exp(0.5 × (2u − 1)) = 4.14 → 8 of 41 (19.5%).
Fisher: 0.4 + fishing 1.6 + coast 0.8 = 2.8 → 2.51 → 5. Harbourmaster: `one` → 1. The tail (n ≥ 24) leaves out this port's
one-hand carpenter and a few others by the seed; the core trades stay. Result: 19 jobs, H = 2.645, top share 0.195.
**Production**: a fisher (`makes [dried_meat, 3, 16]`) standing at the waterside from 04:00 to 13:00 banks 9 h → 3 units
of smoked fish; the same 9 hours with the fisher away bank nothing.

## 5. Edge Cases
- **No workplace of a job's kind in the built town** (a ruin cut that building): the worker takes another kind from its
  `at` list, then its open-air spot, then the street. Never inside a wall.
- **A walk the foot grid can't plan** (a doorway sealed by a car): the worker walks straight and the ordinary detour
  steering unsticks them; a path is re-planned every 4 s.
- **The clock jumps** (sleep, a test): at most 1 game hour is banked per tick per worker; the rest was not seen.
- **Shelf full**: banking stops at the cap until someone takes from it (the work waits; nothing is minted later).
- **Character budget**: workers never take the last 28 slots; the battery's other systems and the director's events come first.
- **Off-screen towns** produce nothing (law 1: a success the server didn't see doesn't happen). The SIM-CORE lane's
  off-screen tier is where a far town's work would be simulated.
- **Fixture drift**: `tools/role-diversity.mjs` scores `tools/fixtures/settlements.json`; when the plan changes (a new
  site row, a moved corridor) refresh it with `--refresh` against a running game. The selftest scores the live plan,
  so a stale fixture shows up as a failing check, never as a silent pass.

## 6. Dependencies
**Uses**: `data/citygen.js` (ARCHETYPES, KINDS), `data/sites/*` (society, economy, structures, terrain), `world/citygen/site.js`
(layout → archetype, structure → kind), `systems/citygen.js` (the plan, the live towns and their buildings, `stampAt`),
`data/items.js`, `data/ring.js` (name pools), `systems/characters.js` (`outfit`, the `work` pose), `main.js` (`addChar`,
`removeChar`, `footPath`, `randomFlag`), `systems/ai.js` (`move`).
**Used by**: `ui/dialogue.js` (talk), the selftest, the goal loop. **Next users**: trade (buying from `stock` via `take`),
SITE-STORIES (a site's problem can be its missing worker), SIM-CORE (off-screen production), LSW-BODIES (workers are
ordinary characters, so they wear LSW bodies when near).

**Shared-file hooks (exact):**
- `web/src/main.js`: import `Workforce`; `this.workforce = new Workforce(this)`; `this.workforce.update(simDt)` before `this.pulls.update`.
- `web/src/systems/ai.js`: `if (c.occRec && g.workforce?.think(c, dt)) continue;` before the pulls line.
- `web/src/ui/dialogue.js`: `this.g.pulls?.talkFor(c) ?? this.g.workforce?.talkFor(c)`.
- `web/src/agent/api.js`: import `townJobs, rolesChecks`; the `town` command's `action` and `id` args and its first line
  handing non-night actions to `townJobs`; the battery turns the workforce off with the pulls and calls `rolesChecks`
  after the wrecks checks (inside the citygen stage), then restores it.
- `web/docs/COMMANDS.md`: regenerated.

## 7. Tuning Knobs (`data/occupations.js`)
| knob | value | safe range | what |
|---|---|---|---|
| `MIX.workShare` | 0.55 | 0.4–0.7 | share of people who hold a job here |
| `MIX.minWorkers / maxWorkers` | 8 / 64 | 6–12 / 40–80 | workforce bounds |
| `MIX.minPop` | 6 | 4–10 | below this, nobody works there |
| `MIX.cap` | 0.4 | 0.15–0.4 | default most share of one job |
| `MIX.jitter` | 0.5 (loop round 4) | 0–0.6 | per-settlement noise on scores (neighbours differ) |
| `MIX.tailN` / `tailKeep` | 2 / 0.7 (loop) | 0–3 / 0.5–1 | the long tail of small trades and how often each is there |
| `MIX.tailCore` | 1.5 | 0.8–3 | how strongly a job must fit a place to be its core (never dropped) |
| `MIX.tailFrom` | 24 | 12–48 | the smallest workforce the tail thins |
| `MIX.offWealth` | 0.35 | 0.1–1 | a job outside its wealth band |
| `MIX.neighbourKm` | 80 | 40–150 | how far a same-kind neighbour counts |
| `WORK.maxLive` | 24 | 12–32 | workers real at once (CPU, character slots) |
| `WORK.reserve` | 28 | ≥ AMBIENT_RESERVE | slots never taken |
| `WORK.promoteR / demoteR` | 170 / 240 | promote < demote | hysteresis |
| `WORK.maxDh` | 1 | 0.25–2 | game hours one tick may bank |
| a row's `makes[1]` | 2–12 h | > 0 | work hours per unit |
`occ-check.mjs` fails a knob outside its range, and freezes `GOAL`.

## 8. Acceptance Criteria (`selftest only=occupations:`)
| check | proves |
|---|---|
| `occupations: the occupation rows validate…` | 40+ jobs, each with a real workplace kind, a real shift, real ITEMS it carries and makes, known tags, three lines; a deliberately broken row is caught on 7+ counts |
| `occupations: every peopled settlement in the live plan meets the diversity goal…` | the goal, on the game's own plan (not the fixture): every settlement H ≥ 1.6, no job > 25%, nearest same-kind neighbour ≥ 0.3 apart |
| `occupations: a port has dock work and the dry desert has none…` | every port town keeps dockhands and a harbourmaster; no dry-desert settlement has a dock job |
| `occupations: a worker walks from home to their workplace at the start of the shift…` | at home before the shift; after it starts they foot-path to the job, arrive, take the work pose; they carry a two-letter flag and their name; they talk about the job |
| `occupations: produced goods appear only after work happened…` | the same shift hours with the worker away make nothing and bank nothing; worked at the bench they make exactly floor(hours / per) units, each logged to that worker |
| `occupations: a dead worker stays dead…` | a killed worker folded and the town re-promoted: the record is dead and no character comes back |
Plus `node tools/occ-check.mjs` (the loop's guard: ports, deserts, farm towns, mines, raider camps, military sites,
swamps read right; knobs in range) and `node tools/role-diversity.mjs` = 1 (the goal met on the fixture).
