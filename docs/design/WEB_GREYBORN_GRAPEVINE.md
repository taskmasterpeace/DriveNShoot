# WEB_GREYBORN_GRAPEVINE: the ones who kept something, and the hot ground

**Status:** v1 (2026-10-23), built in `web/` on `feat/web-infected2`. **Owner of the call:** Robert (EM3 Briefing,
2026-10-23: "Infected: three of our own"). **Canon:** `docs/design/THE_INFECTED.md` (the Trials, the vocabulary law,
the mystery ledger, no conversion ever), `docs/design/WEB_INFECTED.md` (the four kinds already built),
`docs/design/WEB_WORLD_MEMORY.md` (people know only what they saw), `docs/design/WEB_FAN_SERVICE_BIBLE.md` (HOT GROUND,
the IP wall). **Layer:** L5 Life in `WEB_WORLD_EDITOR_PLAN.md` §3.1.

**Files.** Rows: `web/src/data/greyborn.js` (settlements, roles, traps), `web/src/data/grapevine.js` (packs, the
model's knobs), `web/src/data/hotground.js` (zones, dose, creatures). Systems: `web/src/systems/traps.js`,
`greyborn.js`, `grapevine.js`, `hotground.js`, joined by `wilds.js` (one facade, owned by `systems/zombies.js`).

---

## 1. Overview

Robert named three things for the infected: **the Greyborn** (they set traps, they have societies), **the Grapevine**
(they watch people and learn from them, eat bodies, run, strike only when they can win, and know only what they saw),
and the hot ground (radiation areas where strange creatures live). This doc builds the first two as kinds and the third
as zone rows with two creatures, all as data rows on one facade.

### 1.1 The Wardens question: RESOLVED

Robert said "Wardens are zombies too" in the briefing. **Resolved 2026-10-23: he misspoke. The Wardens stay Rust
Haven's human town guard.** Nothing in this arc touches them. (The draft had weighed a twist, an infected faction and a
misremembered name, and had already ruled the twist out: canon 0.5 says nobody ever turns.)

### 1.2 How the new kinds sit with the four that exist

| | The herd (built, canon) | The ones who kept something (this doc) |
|---|---|---|
| Kinds | Shambler, Sprinter, Echo, Choir-Touched | Greyborn, Grapevine |
| What they are | failed protocols; they belong to PLACES | a herd that kept a society; hunters that kept a mind |
| How they find you | noise (and the Sprinter's sliver of sight) | the Greyborn: their watchers' eyes, inside their territory. The Grapevine: eyes and ears, and what other packs tell them |
| What they want | the loudest thing | the Greyborn: their ground kept. The Grapevine: you, on a night they can win |
| Counterplay | silence, walking, the dial, the overheat window | the Greyborn: look before you step; go round; kill the elder. The Grapevine: never show them the same weakness twice |

- **The Greyborn are infected** (`faction: 'zombie'`, the `infected` people row: they never testify). They are what
  the Echo's pattern-work becomes when a whole herd keeps it together: they lay snares instead of working at boards. Ash
  grey skin, and a settlement you can walk into.
- **The Grapevine are counted with the infected and look like people.** `faction: 'grapevine'`, people row `infected`
  (no human gossip, no standing for killing them). The mystery ledger holds: nothing ever says whether a protocol made
  them or people just went this way. The street name says how they work: word travels along them. What one pack has
  seen, the next one hears.
- **The vocabulary law holds:** nothing on screen says the Z-word. Their tags say *Greyborn*, *Greyborn Trapper*,
  *Greyborn Watcher*, *the Elder*, *Grapevine*.

## 2. Player fantasy

*You find the first one with your ankle: a wire loop under the sand, and you're stuck in it while something grey stands
up on the ridge and calls. You go back in daylight, crouched and slow, and now you see them: a bent sapling, a
loose-laid plank over a hole, a wire at shin height with cans on it. You cut three of them out. Next week the
settlement's watchers are already up when you come over the rise, and there's a fresh snare on the exact line you walked
in on.*

*Out on I-10 at night you shoot a raider and reload, and reload again, and there's a shape at the edge of your
flashlight that wasn't there before. It doesn't come. It watches you. The third time your slide locks back, four of
them are already running. You put a round in the first and the others are gone into the dark before you can turn. In the
morning the raider you killed isn't where you left him; there's a dark patch, and some bone.*

*The Glass Flats past the base glow at night. Your dosimeter clicks faster the further in you go, and the pale shapes
that come up out of the fused sand are hot when they bite.*

## 3. Detailed rules

### 3.1 Traps (`systems/traps.js`, rows `TRAPS` in `data/greyborn.js`)

Traps are world objects with a position, an owner (a settlement, a pack or nobody), a kind and a state:
`armed`, `sprung` (it caught something or went off) or `disarmed`.

| Kind | What it does to whoever steps in | Seen how easily |
|---|---|---|
| **snare** | a wire loop holds them where they stand (`hold` s) for a small bite of damage; a held E pulls it off sooner | normal |
| **deadfall** | a log comes down: heavy damage and knocked flat | easier (the prop is big) |
| **pit** | they drop in: damage, knocked down, held while they climb out | harder (a plank and sand) |
| **tripwire** | a rattle of cans: a noise of 70 m that draws the herd, wakes people and raises the owner's alarm | hardest (a wire) |
| **bait** | a lure: something that looks worth taking. The infected and creatures drift to it; a Grapevine pack waits round its own | made to be seen |

- **They catch anything that walks:** the player, people, the infected and the hot ground's creatures. The owner's own
  people never trip their own traps. A car springs one harmlessly (only the tripwire still rattles).
- **Seeing one (perception and skill).** A trap is drawn half buried in the ground's colour and is easy to miss. It
  becomes **spotted** after you've looked at it for `look` s from inside your **spot range** (§4), inside your sight
  cone, with a clear line. Spotted, it gets an amber ring and a floater naming it. Crouching and moving slowly widen the
  range; night narrows it to almost nothing outside your flashlight's cone.
- **Trapcraft** is a skill learned by doing: every trap spotted, disarmed or survived adds to it, and each level widens
  the spot range and shortens and steadies the disarm.
- **Disarming.** Stand at a spotted, armed trap and hold **E** for the disarm time. On a slip roll (lower with trapcraft)
  it goes off on you. A disarmed snare, tripwire or deadfall gives you a piece of scrap (there is no wire item yet).
- **Re-laying.** A sprung or disarmed trap belonging to a living settlement is re-laid by a trapper after `relay` s; it
  goes back to unspotted. This is the society you can watch.

### 3.2 The Greyborn (`systems/greyborn.js`, rows `GREYBORN`, `GREYBORN_TOWNS` in `data/greyborn.js`)

- **A settlement is a record** keyed by its row's id, like a ring household (`systems/residents.js`). The record holds
  the members (role, seed, name, flag, hp, dead, where they fell), the traps it laid, and what it remembers of
  intruders. The look of the place (lean-tos, a fire pit, a stake fence, bone strings, drying racks) is built once as
  one merged mesh plus one ember mesh.
  - **Promote:** you come within `promoteR` of the centre and the budget allows: each living member becomes a
    character at their role's spot; the dead lie where they fell.
  - **Demote:** you go past `demoteR` and nobody is fighting you: written back to the record (hp, death, where) and
    taken out. A save stores the records, never the characters.
- **Roles** (a row each):
  - **trappers** lay and re-lay the settlement's traps on its ring of trap spots;
  - **watchers** stand at posts on the edge facing out. One who sees an intruder for `alarmFor` s raises the **alarm**:
    a long call, every member of the settlement turns on the intruder, and the alarm carries as a noise;
  - **the elder** sits at the fire. While she lives the settlement holds together: kin defend the ground, trappers
    re-lay. Kill her and it breaks: the kin scatter, nobody re-lays a trap;
  - **kin** are the rest: they sit and work round the fire, and defend.
- **Territory:** they defend inside `territory` m and give up the chase past `leash` m; then they go home.
- **They remember intruders** on the record, as people do (WEB_WORLD_MEMORY), but only what they saw: a watcher has
  to have seen you for you to be known. A known intruder who comes back within `rememberDays`:
  - the watchers are on alert from the moment of promotion (a wider eye, an alarm at first sight);
  - a trapper lays a fresh snare on the line you came in by last time.
  The record keeps `visits`, `lastDay`, `killed` (theirs, by you) and `entry` (where you crossed the territory line).

### 3.3 The Grapevine (`systems/grapevine.js`, rows `GRAPEVINE`, `GRAPEVINE_PACKS` in `data/grapevine.js`)

A **pack** is a record: its members, its hunting ground, and its **model of the player**. Packs are promoted at night
when you are within `promoteR` of their ground (or by day if they are already on you), and demoted the way the
Greyborn are. The model is saved with the record, so a pack that learned you last week still knows you.

**The model holds only what a member observed:**

| Field | Learned when | Used for |
|---|---|---|
| `watched` (s), `sightings` | a member sees you (`g.sees`, inside its sight range) | nothing is decided on an empty model |
| `weapons[k]`: held, shots, `reach` | they see you holding k; see or hear you fire it; see you fire toward them from d m | how dangerous you are, and how far off to stand |
| `shotsHeard`, `shotsSeen` | a shot from where you stand inside their hearing, or seen | ammo use |
| `magEst`, `chain` | the shots they saw between two reloads they saw (a missed shot breaks the chain) | when you'll run dry |
| `reloadsSeen`, `reloadTime` | they see a reload start and finish | the reload window |
| `runs` | they see you sprint away from a threat | you run, so cornering pays |
| `night` (s watched at night), `light` | seen at night; with your flashlight on | they come at night, and your light gives you away |
| `lowestHp`, `woundedSeen` | seen with your hp low | the wounded window |
| `alone`, `allies` | seen with or without people at your side | odds |
| `sleepsSeen` | seen asleep | the sleep window |
| `told` | another pack told them (§3.3.4) | the same fields, at half weight |

1. **No cheating knowledge.** Every field is written only by a member's own sight or hearing (§4), or by another pack
   telling them. A pack that never saw or heard you has an empty model, and a pack with an empty model never strikes:
   it stalks to learn.
2. **Pack states:** `roam` (no one in sight) → `stalk` (it has you: keep `stalkD` m off, where it can see you; when you
   look at a member for `watchedFor` s it breaks your line of sight) → `strike` (every member sprints in and cuts) →
   `retreat` (scatter out of sight, regroup) → `feed` (eat a body, when no one living is near).
3. **Strike only when the model says they win** (§4 odds): a **window** must be open and their power must beat your
   threat. Windows:
   - **reloading**: they see you reloading now, and have seen at least `learnReloads` reloads before (they know what it
     means and how long it lasts). With `magEst` learned, they start the rush on your last round;
   - **wounded**: seen at or under `wounded` of your hp;
   - **dry**: they believe your gun is empty (their count) and saw you fail to reload;
   - **asleep**: seen asleep.
   Being alone isn't a window; it shrinks your threat.
4. **The grapevine.** At dawn, packs whose grounds lie within `tellR` of each other pass on what they know at `toldW`
   weight; promoted packs within `tellNear` m do it on the spot. What they are told counts toward the odds, but only a
   pack's own sightings open a window.
5. **Retreat** when they are outmatched: hit while no window is open, power below `retreatAt` of your threat while
   you're inside your reach of them, or half the pack down. They run to a spot out of your line of sight, regroup, and
   come back to stalking after `regroup` s; a pack that lost half goes home.
6. **They eat the dead.** A body within `feedR` of the pack, with no one living within `safeR` of it: they go to it,
   crouch over it for `feedFor` s, and it is gone. What's left is the clue: a dark stain and a scatter of bone, and the
   event `bodyEaten`.
7. **Ambushes and lures.** A pack that has watched you for `ambushAfter` s may lay a **bait** trap ahead of your heading
   and wait round it; walking up to it opens a surprise window for them.
8. **Night is theirs.** Their eyes catch your light: at night a member inside 30 m of a lit player shows two pale
   points of eyeshine at the edge of the beam.

### 3.4 Hot ground (`systems/hotground.js`, rows `HOT_GROUND`, `HOT_FAUNA`, `DOSE` in `data/hotground.js`)

- **A zone is a row:** centre, radius, dose at the centre, its look (a sick yellow-olive tint on the ground, fused glass
  patches, dead husk trees, rusted drums, a faint ground glow at night) and its creatures.
- **Dose** climbs while you stand in it (§4), at half in a car. It decays slowly outside. The dosimeter clicks faster as
  the rate rises, and a toast names the ground when you enter.
- **The need hook (`DOSE`)** is a row the survival system can absorb whole: bands (`clean`, `mild`, `sick`, `grave`),
  each with the share of max hp it cuts until treated, the decay per game hour, and the treating item. Until survival
  absorbs it, `hotground.js` applies the cut itself as a cap on your hp, so it costs something today.
- **Creatures** (rows, so the fauna layer can take them later):
  - **Glasslings:** pale, glass-backed crawlers, buried in the fused sand. They come up when something walks within
    `wake` m, bite, and the bite is hot (adds dose). They stay in the zone.
  - **the Lantern:** a tall pale figure among the husks whose head glows at night. It never attacks. It follows at a
    distance, and while it is near the dose rate doubles.

## 4. Formulas

| Name | Formula | Variables | Example |
|---|---|---|---|
| Spot range | `S = T.spot · (crouch ? 1.5 : 1) · pace · light · (1 + 0.12·craft)` | pace 1.25 under 2.6 m/s, 0.5 over 5 m/s, else 1; light `1 - 0.7·night`, or 0.9 inside the flashlight cone | snare 4 m, crouched and slow at noon: 7.5 m; walking at night without light: 1.2 m |
| Spotted | `look ≥ 0.5 s` accumulated while `d ≤ S`, within 70° of your aim and with a clear line | | |
| Disarm time | `T.disarm · (1 − 0.06·craft)` | | snare 2.2 s, craft 3: 1.8 s |
| Slip | `T.slip · max(0, 1 − 0.1·craft)` | | tripwire 0.25, craft 5: 0.125 |
| Trapcraft level | `floor(√(xp / 4))`, max 10 | spot +1, disarm +2, sprung on you +1 | 16 xp is level 2 |
| Greyborn alarm | watcher sees intruder `≥ alarmFor` | sight `watchR · (known ? 1.5 : 1) · (1 − 0.55·night)`; `alarmFor` 0 if known | 45 m by day, 20 m at night |
| Grapevine sight | `d ≤ sightDay·(1 − night) + sightNight·night`, × `lit` when your flashlight is on at night | 60 / 22 m, lit ×2.2 | night with a light: 48 m |
| Shot heard | `d ≤ hear` from where you stand | 110 m | |
| Your threat | `θ = danger · (1 + 0.6·allies) · W` | danger: the worst weapon they've seen you hold (pistol 1, smg 1.7, shotgun 1.6, rifle 1.8, bare hands 0.4); W: reloading 0.15, dry 0.1, asleep 0.05, wounded 0.5; alone ×0.85 | pistol, alone, reloading: 0.13 |
| Pack power | `π = Σ_alive hp/100 · 0.75` | | 3 at full: 2.25 |
| Strike | `window ∧ π ≥ θ ∧ watched ≥ 4 s` | | |
| Retreat | `(hit in last 3 s ∧ ¬window) ∨ (π < 0.6·θ_noW ∧ d < reach + 5) ∨ lost ≥ half` | | |
| Stalk distance | `stalkD = clamp(reach + 8, 18, 38)` | `reach` 0 until they've seen you fire toward them | never shot at: 18 m (just past a flashlight's 15 m beam) |
| Dose rate | `R = Z.dose · (1 − d/Z.r)^1.5 · (car ? 0.5 : 1) · (lantern near ? 2 : 1)` per second | | 3 rad/s at the centre |
| Dose cut | the band's `cut` of max hp | mild ≥ 100: 10%, sick ≥ 300: 25%, grave ≥ 600: 45% | |

## 5. Edge cases

- **A pack spawned while you aren't in sight** learns nothing until a member sees or hears you; the `grapevine` command
  shows the empty model, and a check proves it.
- **You reload behind a wall:** unseen, so it doesn't count, and it breaks their `chain` (they can't know how many you
  fired).
- **A trap under a parked car or a body:** it springs on the next one to step there; a corpse never springs it.
- **The owner's own** never trip their traps; a Greyborn of another settlement would (there is one today).
- **The elder dies while the settlement is demoted** (killed by raiders off-screen isn't simulated): only deaths seen
  on characters are written back.
- **A body that is someone's record** (a ring resident, a named NPC) is never eaten: their records own their bodies.
- **Saves:** settlements, packs, traps, trapcraft and dose are one `wilds` block; their characters are never saved as
  plain characters (they'd come back as shamblers). An old save without the block loads with fresh records.
- **Budget:** both systems ask the residents' budget rule first (never the last `AMBIENT_RESERVE` slots) and yield
  their farthest unengaged member when the cap is full.
- **The infected and the Grapevine meet:** the herd attacks anyone living, and the Grapevine run from it.
- **Hush:** `wilds.enabled = false` stops promotion and thinking; selftests of other systems are far from the sites.

## 6. Dependencies

| System | What it needs from this | What this needs from it |
|---|---|---|
| `systems/zombies.js` | owns `Wilds`; routes `zkind` greyborn / glassling / lantern to their brains | `spawnKind` pattern, `onNoise` |
| `systems/ai.js` (2 lines) | routes `faction: 'grapevine'` to `g.grapevine.think`; anyone armed fights them | `move`, `sees` |
| `systems/residents.js` | — | the promote / demote pattern, `AMBIENT_RESERVE` |
| `agent/api.js` | `traps`, `greyborn`, `grapevine`, `hotground` commands; 8 checks; the `wilds` save block | `selftest` |
| `systems/survival.js` | the `DOSE` row to absorb later | `g.survival.sleep` (seen asleep) |
| `systems/memory.js` / `deeds.js` | — | the rule "only what was seen" (this doc keeps its own records) |
| `WEB_ATLAS.md` | Glasslings and the Lantern join the proposed creature kinds; the Greyborn and the Grapevine join the cast | sites to put them on later |

## 7. Tuning knobs

| Knob | Default | Safe range | Affects |
|---|---|---|---|
| `TRAPS.*.spot` | 3-6 m | 2-8 | how often you walk into one |
| `TRAPS.*.disarm` / `slip` | 1.6-3 s / 0.1-0.3 | 1-5 / 0-0.5 | the price of clearing a path |
| `TRAPS.snare.hold` / `pit.hold` | 4 / 6 s | 2-10 | how long they have you |
| `GREYBORN_TOWNS.*.promoteR` / `demoteR` | 150 / 210 m | promote < demote − 40 | streaming churn |
| `territory` / `leash` | 70 / 110 m | | how far they chase |
| `relay` | 90 s | 30-600 | how fast the ring of traps comes back |
| `rememberDays` | 7 | 1-30 | how long they know you |
| `GRAPEVINE.learnReloads` | 2 | 1-5 | how fast they learn your reload |
| `GRAPEVINE.sightDay` / `sightNight` / `lit` | 60 / 22 / ×2.2 | | how much the night and your light give away |
| `GRAPEVINE.retreatAt` | 0.6 | 0.3-0.9 | how readily they run |
| `GRAPEVINE.feedFor` / `feedR` | 6 s / 70 m | | how fast the dead vanish |
| `GRAPEVINE.toldW` / `tellR` | 0.5 / 600 m | | how far your habits travel |
| `HOT_GROUND.*.dose` | 3 /s | 0.5-10 | how long you can stay |
| `DOSE.bands` | 100 / 300 / 600 | | when it starts to cost you |

## 8. Acceptance criteria

1. `selftest` (whole battery) green twice on fresh pages, with these checks:
   - traps: a Greyborn snare catches a person walking through it; a second trap is spotted by looking carefully and
     disarmed by holding E, and does not go off;
   - Greyborn: a settlement promotes near you and demotes when you leave, keeping a wound and a death on its record,
     and promotes them back the same;
   - Greyborn: a watcher who sees you calls the alarm; the settlement remembers you, and next visit a snare waits on the
     line you came in by;
   - Grapevine: a pack that has seen and heard nothing has an empty model, however much you shoot out of its sight;
   - Grapevine: after watching you reload twice it starts its rush within half a second of your third reload, and not
     on the first;
   - Grapevine: shot while no window is open, it retreats out of reach;
   - Grapevine: it eats a body when nobody living is near, and leaves a clue;
   - hot ground: your dose rises in the zone, at half in a car, and not outside it.
2. `node tools/ip-lint.mjs`: 0 deny.
3. Draw calls at or under 150 at each site.
4. Screenshots in `docs/renders/web/infected2/`: a Greyborn settlement, a trap seen and then disarmed, a Grapevine pack
   at the edge of the light at night, a hot ground zone. Each looked at as a hard critic.

## 9. As built (2026-10-23)

- **Where they are on the Phoenix island:** ASH HOLLOW at (185, 425), in the open desert south of the ruins between
  two ridges; the mile-marker pack's ground at (−410, 30) by I-10 and the dry-wash pack's at (−290, 425) (400 m apart,
  so they tell each other at dawn); THE FUSED FLAT at (45, −445). All are more than 150 m from every place the selftest
  battery stages, so nothing promotes into another system's check.
- **Placement is validated against the ground:** trap spots, watcher posts, shelters, stakes and totems that would land
  inside a ridge or behind it from the fire are pulled in or dropped.
- **Draw calls** (`perf` after a render): settlement 89 by day / 90 at night, hot ground 95 / 97, the Grapevine's
  ground at night 91 (Rust Haven at night 84 for comparison). New meshes: traps 2 (parts, rings), settlement 2 (merged
  place, embers), hot ground 3 per zone (stain, glow, merged props), glints 1.
- **Shared files touched:** `systems/zombies.js` (owns `Wilds`; routes `c.wild`; the dawn clean-up and `onNoise` skip
  `c.wild`), `systems/ai.js` (two lines: the `grapevine` route and "anyone armed fights them"), `agent/api.js` (four
  commands, eight checks, the `wilds` save block and the snapshot filter `!c.wild`), `web/docs/COMMANDS.md`
  (regenerated). `main.js`, survival, terrain, `world/*` and vehicles are untouched.
- **Selftest:** 150/150 twice on fresh pages (2026-10-23, 288 s and 284 s).
- **Open, for Robert:** the engine's night (sky.js `SUN_I`/`HEMI_I`, raised on 2026-10-23 after "it's too dark, bro")
  reads as dusk from above on a clear night; the Grapevine shot was taken in ashfall, which is darker. "Truly dark and
  scary" is a sky-lane call (it would need the night fill lowered or a moonless-night weather row), not this arc's.
