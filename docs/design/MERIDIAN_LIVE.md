# MERIDIAN LIVE — the connected town (every shipped system gets a MOMENT)

**Status:** GREENLIT design spec (owner Q&A, 2026-07-09). **The gap it closes:** eleven arcs shipped
as sim-proven DIRECTORS, but almost none as player-facing MOMENTS — the pitch works but has no
E-prompt, the clone chair works but can't be sat in, the book quotes honest odds to nobody, and NAV
can walk a body through a real door while no resident ever does. The house law is the reason this
spec exists: **if the player can't see it, it doesn't exist.** This contract wires every shipped
director to a diegetic surface in Meridian and adds the test gear the proving ground now lacks.

## 0. RATIFIED RULINGS (owner Q&A 2026-07-09)

| # | Ruling |
|---|---|
| 0.1 | **DIEGETIC PROMPTS FIRST.** v1 surfaces are E-prompts at the buildings (the shipped interactable grammar) + K-sheet summary lines. Proper panels (empire ledger, bet slip, clone terminal — per UI_DESIGN_LANGUAGE) come later, only where prompts strain. |
| 0.2 | **THE TOWN BREATHES: 6–8 named residents** walk real schedules door-to-door on the NAV walk graph. They are also the extortion WITNESSES and the future family substrate. |
| 0.3 | **All three test additions:** THE POND (water southwest of town), THE ECO PADDOCK (a pen at the Test Grounds whose sign prints its cell's live eco floats), and QUARANTINE DRESSING on the I-95 approach (the infected corridor read — dressing only; the law mechanics stay I2). |
| 0.4 | **Execution order:** this spec ships FIRST, then ECOSYSTEM P1p2 (creatures) lands into a town that can already show it. |
| 0.5 | **THE PLAY.BAT TRUTH (the "looks the same" lesson, paid 2026-07-09):** PLAY.bat runs the MAIN checkout. An arc is not "visible" until its branch merges to main — every future arc's definition of done includes the merge. Sims prove correctness; PLAY.bat proves existence. |

## 1. Overview

One pass over Meridian connecting what already exists: EMPIRE (pitch/collect/buy-in), CLONING (the
chair + the vat), BETTING (race day at the grandstand), NAV (residents on schedules), ECOLOGY (the
paddock read), WEATHER/MUD (the pond + dirt spurs), INFECTED (corridor dressing). Zero new
directors — every verb here calls an API that is already sim-green. The spec's product is
*moments*: prompts, walkers, signs, and radio lines.

## 2. Player Fantasy

You roll off Exit 9 at dusk. The streetlights are on. The preacher is crossing Main toward the
church — you know him by name now. E at the diner counter: **"THE PITCH — 25% of the take, or buy
in for 350."** The cook looks at the waitress; the waitress was walking home when you did it, and
the county's a little hotter for it. Saturday the radio calls race day; you put 40 scrip on
HALF-STACK at 7-to-1 at the tote board and watch the field tear past the grandstand. When it goes
wrong someday, the chair at the clone wing has your Tuesday self waiting. Down at the pond, something
big moved in the reeds. The town isn't a test rect anymore. It's a place you live in.

## 3. Detailed Rules

### 3.1 THE PROMPT LAW (every shipped verb gets a door)
Interact anchors (the shipped `interactable` grammar — group + `interact_prompt(main)` +
`interact(main)`) spawn WITH the shell for rows that carry verbs:
- **Businesses** (profit_day > 0): counter anchor inside the door — prompt cycles by state:
  `E — THE PITCH (25% of ~14/day)` → after: `E — COLLECT (banked 21)` · `HOLD E — BUY IN (350)`.
  Calls `empire.pitch / collect` verbatim.
- **clone_wing / blackmarket_vat:** the CHAIR anchor — `E — SIT THE CHAIR (60 scrip · 1 hour)` /
  vat: `E — NO QUESTIONS (20 scrip · defect risk)`. Calls `cloning.begin_scan`.
- **race_track_grandstand:** the TOTE BOARD — on race day: `E — RACE DAY: the card` → a 3-line
  toast card (names + decimal odds) → number keys 1-4 place a fixed stake; after settle:
  `E — COLLECT WINNINGS`. Calls `ProtoBetting.race_card / place / settle`.
- **church_small:** `E — SIT A WHILE` (visit dwell; the wedding anchor arrives with F1).
- Prompt range 2.6 m (the BOARD tolerance); one anchor per building, at the interior anchor point.

### 3.2 THE RESIDENT CAST (data/residents.json — rows, never code)
6–8 rows: `{id, name, home (placement_id), work (placement_id), depart_h, return_h, look{}}`.
V1 cast: the preacher (house→church 8h), the jeweler (house→jeweler 9h), the bartender
(house→bar 15h, back 2h), the cook (house→diner 6h), two KIDS (houses→school 8h, back 15h),
the drifter (motel→random business daily). ProtoJourneys walks them (walk graph, real doors,
never-a-statue); at work they DWELL inside (despawned to a record, the building "holds" them);
weekends off for the kids. **THE WITNESS LAW:** an extortion PITCH with a resident within 20 m →
`+0.15 resentment` on that holding and `heat +0.5` — the town SAW you.

### 3.3 THE CALENDAR SURFACES
Race day rolls on the existing weekly calendar (`events.gd`): the radio announces it morning-of
("race day at the Meridian grandstand — post time at dusk"), the tote prompt goes live, the card
settles at dusk (seeded — the same day always runs the same race). K-sheet gains: EMPIRE line
(holdings · banked · heat), FEVER line (already law), JOURNAL count, NEXT RACE day.

### 3.4 THE TEST GEAR (0.3)
- **THE POND** — authored water at ~(30, -418) (southwest of town, inside AUTHORED): a 40×30
  water rect + reed dressing + a plank footbridge. Tests: wade/swim/drown, bridge decks, gator
  (P1p2 drops it HERE first), mud-wash (drive through after rain), water grip.
- **THE ECO PADDOCK** — at the Test Grounds: a fenced 20×20 pen + a live `ProtoSign` that
  reprints its cell's eco floats every game-hour (`food .61 · prey .24 · pred .18 · heat .05 ·
  rot .31`) — the pressure loop, watchable in play. The paddock's cell is NOT protected (the
  loop must run); creatures released inside stay for observation (P1p2).
- **QUARANTINE DRESSING** — the I-95 shoulder ~600 m north of Exit 9: the bandit checkpoint kit
  (barriers/cones) + painted signage ("COUNTY LINE — 40 HEAD CROSSED AT DUSK") + one road_shoulder
  crash-victim husk. READ ONLY — no stops, no law, until INFECTED I2 wires F-STOP-Q.

## 4. Formulas

- **Witness:** `resentment += 0.15`, `heat += 0.5` per resident within `WITNESS_R 20 m` at pitch
  time (max one increment per resident per pitch). [R 12–30; ex: pitching the diner at noon with
  the cook inside and a kid passing = +0.30 resentment, +1.0 heat — daylight crime costs.]
- **Schedules:** depart when `hour ≥ depart_h`, return at `return_h`; journey speed 1.6 m/s
  (residents stroll). Late arrivals are honest (NAV prices the route); K says "at work/home/walking".
- **Race day:** `is_race_day = (day % 7 == RACE_DOW 6)`; stake fixed 20/40/80 by key; settle at
  `dusk_h` via `ProtoBetting.settle(card)`.
- **Prompt state:** business prompt = PITCH if `!holdings.has(pid)`, else COLLECT (banked ≥ 1)
  with HOLD-E = BUY-IN while extorted.

## 5. Edge Cases

- **Resident's workplace gets extorted while they're walking there** → they still go (v1 —
  fear arrives with F1); the witness law applies only at pitch-moment proximity.
- **Race day while the player is mid-card elsewhere** → the card settles anyway at dusk (seeded);
  uncollected winnings persist on the card in the save.
- **Two prompts in range (counter + chest)** → the shipped interact scan already picks nearest;
  anchors sit ≥ 2 m from any chest.
- **A kid's school day crosses a save/load** → journeys are v1-transient: on load, residents
  re-derive position from the CLOCK (before depart = home, after = work) — no stranded walkers.
- **The pond vs THE VOID NET** → pond floor is a real body at −1.2; VOID_Y is −6; swimming/drowning
  never trips the net.
- **Paddock cell refill** → not protected; if population refills a threat INTO the pen's cell it
  spawns outside the fence (the pen is small; safe_to_spawn's player-distance gate covers the rest).
- **Extorting with zero residents spawned (dawn)** → legal and quiet — night crime is the point.

## 6. Dependencies (bidirectional)

Consumes (all SHIPPED): `empire.gd` · `cloning.gd` · `betting.gd` · `nav/journeys.gd` +
`walk_graph` · `ecology.gd` (paddock read) · `events.gd` (race day) · `radio.gd` (announcements) ·
the interactable grammar · ProtoSign. Amends (one line each, same commit as execution):
THE_FAMILY_EMPIRE (witness law feeds resentment; residents = the family substrate),
SPECTACLES (race day's first live venue), CLONING (the chair's door), NAVIGATION (residents are
journey consumers #1), LIVING_WOUND_ECOSYSTEM (the paddock is P1p2's observation site; the pond is
the gator's first authored water), THE_INFECTED (corridor dressing pre-stages I2), INDEX (row).
UI_DESIGN_LANGUAGE governs the later panel pass (0.1).

## 7. Tuning Knobs

| Knob | Default | Range | Governs |
|---|---:|---|---|
| cast size | 7 | 4–12 | town liveliness vs walker budget |
| WITNESS_R | 20 m | 12–30 | how public a pitch must be to cost |
| resident speed | 1.6 | 1.2–2.2 | the stroll read |
| RACE_DOW / stakes | day 6 · 20/40/80 | any | the weekly rhythm |
| prompt range | 2.6 m | 2–4 | interact feel |
| paddock sign cadence | 1 gh | 0.5–4 | eco read freshness |

## 8. Acceptance Criteria (headless, real inputs; + the PLAY.bat law)

`meridian_live_sim`: (1) every business shell within Meridian carries a counter anchor whose
prompt names THE PITCH with the row's real numbers; interacting calls the REAL empire API (holdings
grow, scrip moves). (2) The chair anchor starts a real scan (scrip down, backup after the hour).
(3) On a staged race day the tote prompt goes live, a bet placed via the real input path pays per
F-PAYOUT at dusk. (4) Residents: at 07h the cook is home; by 09h the cook stands INSIDE the diner
having walked through its door (displacement law all the way); at 16h the kids are back from
school. (5) THE WITNESS LAW: a pitch with the cook within 20 m raises that holding's resentment
by exactly 0.15 and heat by 0.5. (6) The pond drowns a staged walker body and washes a mud-skinned
car (T2 hook noted); the paddock sign's text CHANGES across a game-hour tick; the quarantine
dressing exists on the I-95 approach with zero law behavior. (7) **The merge law (0.5): execution
of this spec ends with the branch merged to main and `world_sim` green ON MAIN.**
