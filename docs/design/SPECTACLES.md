# SPECTACLES — races, derbies, fight nights, and the money riding on them

**Status:** GREENLIT design spec (owner, 2026-07-09: *"different sporting events… go to, bet money,
watch the outcome — a race or a fight or raise-and-fight different things… car races too, especially
when a race track is a large structure"*). **Substrate (all shipped):** `races.json` + `race_board.gd`
+ the Proving Grounds track & ghosts · the vehicular-combat engine itself (a derby is the game with a
fence around it) · martial arts + the pit (unarmed system) · `drone.gd` · the ecosystem's creatures ·
`events.gd` (the calendar) · the book-maker backroom (FAMILY_EMPIRE) · law_profiles (gambling legality
per state). **THE DOG LAW (binding): dogs never fight in pits. Ever.** The bond is the game's emotional
pillar; the beasts that fight are *captured wild things*. **THE PIT LAW (same force — THE_INFECTED.md
0.17): infected never fight in pits either.** They are failed CITIZENS, not wild things; venue rows
carry no infected class and capture gear refuses the `infected` group — at most one bark admits the taboo.

## 1. The five spectacles (every one: WATCH · BET · ENTER yourself)

| Event | Venue (Building Book rows) | You can enter with | The DRIVN twist |
|---|---|---|---|
| **CAR RACE** | `race_track_grandstand` — a LARGE venue structure (oval/circuit + stands + pit lane + tote board), plus street courses off the shipped race boards | your own rig | ghosts, wrenching between heats (mechanics skill), sabotage rumors; THE CRIMSON ROAD cult runs the deadliest circuits |
| **DEMOLITION DERBY** | `derby_bowl` (a junk-walled arena — the engine needs nothing new: it IS vehicular combat) | a beater you're willing to lose | last-rig-rolling; the 5-part damage model is the scoreboard; salvage rights to the wrecks |
| **PIT FIGHT** | `fight_pit` (bar_roadhouse backroom tier → dedicated pit compound) | your fists (the shipped martial-arts ladder) | sponsor & train fighters too (crew rows); regional circuits; the Faith bans it — underground pits in occupied states |
| **BEAST PIT** | fight_pit variant + your **stable** (homebase build-board row) | a captured wild animal you RAISED | the husbandry loop: trap gators/howlers/hogs (ecosystem capture gear), feed/condition them (the hunger clock), your champion is MORTAL — a name, a record, a grave |
| **DRONE DUEL** | `drone_ring` (a caged rig — junkyard tier) | a combat drone you built | scrap-built battle-bots; losing = losing the machine; the tonally-clean bloodsport |
| **MONSTER TRUCK RALLY** (#6 — MUD_AND_MONSTERS.md §3) | `derby_bowl` / `race_track_grandstand` | the monster truck you BUILT | the crush show (junk-car lines, air, freestyle — physics judges); **the mud-course variant when it rains is the headline**: the traction matrix separates the field; purses seed BIG WHEELS |

## 2. Betting (one system, five events)

The **book** is a row at every venue (and the book-maker backroom takes remote action on city events).
Odds are honest math off visible stats (a racer's rig class + ghost times; a fighter's record; your
beast's condition) with a house margin — `payout = stake × odds × (1 − vig)`. Stakes in scrip, caps by
venue tier. **Fixing** exists and is a crime: throw a race you entered, dope a beast, pay a fighter —
big payout, WITNESSED-crime pipeline + book grudges (the empire's rival directors remember). Gambling
legality follows the state's law profile (the Faith confiscates books; a player-ruled state sets its
own) — a bet slip is contraband where the book is banned. Winnings are physical scrip at the window.

## 3. The calendar & the crowd

Events roll on the existing daily/weekly calendar (`events.gd`): fight night at dusk, race day
weekly per venue, a derby on blood-moon eve (lean into it). Announced by radio + posters
(billboard/lore tie) + the atlas. Crowds are set-piece spawns (the wedding-guest carve-out — never
journeys); the venue is a SCENE: tote board, announcer barks over the PA (audio rows), vendors.
**Events are date venues** (FAMILY_EMPIRE §2.5): take her to the fights; take the kid to the races
(TEACH-wheel bonus afterward — he watched the line you took).

## 4. Husbandry (the raise-and-fight loop, beasts only)

Capture (ecosystem gear: cage traps + bait — the bait verb already exists) → stable at home (build
row; feed on the hunger clock; condition = a training tick) → fight card (matchmaking by weight class)
→ win purses/lose your animal. A beast keeps a NAME and a record; retirement is allowed (the old
champion lives out back — free character); death is a grave by the kennel wall, never respawned.
Wildlife capture pressures the ecosystem honestly (removing a howler from a range lowers its night
pressure — the sector floats already model it).

## 5. Formulas · Edge cases · Deps · Sims (condensed)

`odds_i = (1/strength_i) / Σ(1/strength_j)` normalized, `payout = stake·odds·(1−vig 0.1)` ·
purse = venue tier × event class · fix heat = +3 witnessed + book grudge row · beast condition =
fed × trained × health (0..1) multiplying its strength. **Edges:** you bet on yourself and lose on
purpose → the fix pipeline; your beast dies mid-card → the card continues, the grave persists; a race
crash kills a rival's named fighter → their grudge, your problem; event during a siege → cancelled,
posters torn (the world is honest). **Deps:** races.json/race_board/track (reads), events.gd,
FAMILY_EMPIRE (book backrooms, dates, sponsored fighters as crew), ECOSYSTEM (capture, pressure
write-back), BUILDING_BOOK (venue rows), law_profiles (legality), THE LIBRARY (a racing form is a
skim-able book). **Sims:** `race_event_sim` · `derby_sim` · `pit_fight_sim` · `beast_husbandry_sim`
(capture→train→fight→grave) · `betting_sim` (odds honest, vig applied, fix fires the crime pipeline).
**Phases:** S1 car races at ONE grandstand + betting (most shipped tech) → S2 pit fights + derby →
S3 beast pits + drone duels + husbandry. V1 venue lands on the Hollowpoint corridor.
