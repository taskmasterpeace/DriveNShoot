# THE FAMILY EMPIRE — take the block, the city, the capital; build a family the world can take away

**Status:** GREENLIT design spec (owner directive 2026-07-09, voice): *"Imagine if you could take over a
city — and from that city the capital, whoever runs that state… have babies, a family, an AI wife. I
want her to be able to get killed. Lose your family. Get revenge. Your house burned down. A house in
the middle of nowhere. Work driving cross-country delivering stuff. We gotta add cloning."* Inspired by
Gangland (2004) — **the LOOP, never the skin** (owner: "I don't want to recreate this game").
**Consumes, never redesigns (the locked five):** LIVING_WORLD_DSOA.md — state flips §5-6, law profiles
§6, crime/witnesses §15, jail §16, **CLONING §11** (clone insurance: policy tiers, backup age,
per-state legality, debt — already fully designed; this doc only wires to it). SECURITY_LADDER.md stays
authoritative for wanted/warrants (one proposed amendment, below). Rulers/lore: `rulers.json` is
**mechanical truth**, DIVIDED_STATES.md is **flavor** — reconciled per-state when each ruler's `depose`
block is authored.
**Blueprint law:** the DOG BOND MODEL is the proven emotional engine (named, persistent, save-carried,
mortal, grave + memorial, the bandage race) — the family mirrors it deliberately, beat for beat.

---

## 0. Ratified rulings (resolve the design-pass conflicts — binding)

| # | Ruling |
|---|---|
| **0.1 ONE BUSINESS MODEL.** | Capabilities live on **Building Book rows** (`structure_profiles.json`: `base_profit`, `protection_tier`, `extortable/buyable`, `backroom_type`, `recruit_pool`, `safe_anchor`); **runtime ownership/till/burn live ONLY in the save key `structures_state`** (world JSON never stores ownership). `businesses.json` shrinks to backroom-op rows + tuning. **One profit law, split by owner:** the ROAD/BUILDING side owns world profit (`profit_day = base_profit × TIER_MULT × risk` — tier and risk are world facts); THE EMPIRE owns everything the player does on top (cut, staff_mult, buy-in, heat). `PAYBACK_DAYS = 25`. **The pacing anchor is a tested number:** ~9 freight runs from Meridian buys the Hollowpoint diner (`business_sim` + `delivery_sim` assert it). |
| **0.2 THE HOLLOWPOINT SLICE is the arc's v1 gate**, named in all three docs. | ONE town (Hollowpoint) · ONE business (diner_roadside — live row with entrances) · **EXTORT only** (no buy-in/backroom yet; the player drives the satchel run HIMSELF) · ONE courted wife · an **exterior church_small wedding** (front-door anchors — no interior wave needed) · zero city/capital rungs. Everything else is post-slice. |
| **0.3 THE OFF-SCREEN CRISIS LAW** (the dream-critic blocker). | The dog benchmark works because death is a SCENE you race (the 45-second bandage window). So: lethal off-screen rolls against COURTED+ family **never kill outright** — they resolve to a persistent **DOWNED record with an hours-long game-clock rescue window**, radio-flagged the moment it happens (*"Wren is hurt — she's asking for you"*). **The race home IS the bandage window, scaled to a driving game.** Instant off-screen death only when the warning was ignored or the clock ran out — then the briefing line is YOUR failure, which is what makes it land. `home_raid_sim` asserts it. |
| **0.4 REVENGE IS A DRIVE, not a treadmill.** | Once a killer is named (1–3 game-days, always — including bandit crews), he gets a **FIXED camp at a real exit/POI**, marked as a grudge waypoint on the atlas and the N board. Planning the route and driving to him — through his state's danger — IS the revenge verb. Materialize-ahead is only the fallback if the mark is ignored for days (the world reminds you he's still breathing). `grudge_sim` asserts the camp exists at the mark before you arrive. |
| **0.5 THE ATTENTION LAW** (anti-micromanagement, the Gangland reviewer's #1 complaint). | At most **ONE live surfaced crisis per category** at a time; everything else resolves off-screen into the return briefing. **Stationing an underboss BUYS QUIET**: defend/collect toggles raise the severity threshold of what pings you at all — "answer the phone" means it doesn't ring for you. `delegate_sim` asserts ≤N pings/game-day at 3 staffed cities. |
| **0.6 CO-OP v1 LAW.** | Persons/journeys are host-simulated; clients see ghosts. Family verbs (court, wed, teach) are host-player-only in v1; empire-ledger columns derived from family read defaults for clients. Full family MP sync is banked with partner systems. |
| **0.7 SMALL CONTRACTS.** | The ring = `gold_ring`, **120 scrip**, two rows (items def + prices — the file split law). The SAFE build-board row costs `{scrap:8, scrip:25}` and **deposited scrip IS exempt from the 30% death tax** (a real reason to build it; empire tuning carries the knob; owner-flip flag). Collector dispatch: departs at `collect_hour` when till ≥ `SATCHEL_MIN` (15), carries `min(till, satchel_cap)` (60 / armored 120). Warrant amnesty-on-takeover is a **proposed one-line SECURITY_LADDER amendment** this doc consumes, not asserts. |

---

## 1. THE EMPIRE LOOP (city → capital → the ruler)

**RUNG 0 — SOLDIER.** Work for a holdout boss: `empire_jobs.json` rows in the FIRST-RUN pattern (beats
complete on REAL state — scrip physically delivered, target physically down). Finishing unlocks the
PITCH verb. **The legitimate on-ramp is FREIGHT (§1.5)** — fun before you own anything.

**RUNG 1 — RACKETEER.** Walk into any Building-Book business, E-talk, **PITCH**:
- **EXTORT** — free to demand; the protection fight spawns per `protection_tier` (a witnessed crime —
  straight into DSOA §15's pipeline). Cut = 25% of profit_day. Breeds resentment (an extorted
  proprietor tips the law, can flip to a rival) and **heat**.
- **BUY-IN** — pay `profit_day × 25 × price_mult(respect)`, gated at NEUTRAL standing. Cut = 50%
  (+5%/backroom tier), unlocks the **BACKROOM** (bar→still · auto_shop→chop-shop · pawn_gun_shop→
  book-maker · clinic→clinic-back · **radio_station→pirate transmitter, and it joins the REAL dial**:
  your station enters the Y-scan in that state — one media-manifest row — with a small −heat/day or
  +respect trickle and taunt lines when you rob a rival's collector), recruiting from `recruit_pool`,
  and double territory weight. Contraband backrooms consult the state's CURRENT law — **a
  player-ruled state can legalize its own rackets.**
- **Owned commerce hooks the ONE price choke point** (`trade_price` gains a single owner-cut factor).
- **PROTECTION GETS TESTED BY THE WORLD** (the anti-euphemism rule): events roll real threats — blood
  moons, howler packs, bandits — against businesses under your protection; showing up and defending
  one converts extortion-resentment into standing. **A dog can be stationed as a business guard** (the
  metaworld guard-dog raid roll, verbatim — bond system meets empire, zero new tech).

**RUNG 2 — BLOCKS & THE CITY.** `control_share` per town (extorted ×1, owned ×2, seat ×3); at ≥0.6 the
town's population cells flip `controlling_faction` to **`player_family`** (atlas tint, block flags, a
territory chip). At `city_grip ≥ 0.7` the SEAT opens — **the Carousel purge template verbatim**:
LEVERAGE (three doors: standing walks you in / scrip / seize the ledger by force) → PURGE (the
garrison) → POWER (cut the town's substation) → the loud commit (retaliation waves) → OWNED — and
**LOSABLE** (the deposed faction sieges on the events calendar; relieve by deadline or lose it).

**RUNG 3 — THE CAPITAL.** At `cities_held ≥ cities_req(state)`: the ruler's `depose` block flavors the
SAME seat machine — **one system, ruler-flavored finals**: CEO Marrow (GEORGIA) is a **coup** (own 51%
of Combine businesses and the purge is a formality) · the House (NEVADA) is a **buyout** · Pres-Gen
Hood (TEXAS) is a **military decapitation** (base assault; POWER = the radio station). Success calls
the SHIPPED flip — `world_state._apply_takeover(state, "player_family", your_chosen_law_row)` — and
every radio and TV in the state announces YOUR law. (Three states' rulers carry the title CEO —
GA/NV/**NY** — `seat_roster_sim` asserts all three resolve.)

**§1.4 HEAT & THE LAW'S ANSWER** (wired, never redesigned): a per-state empire-heat ledger (the bandits
sightings shape) fed by extortion/contraband/fights/takeovers, scaled by the ruler's `attitude` dial;
thresholds escalate through the EXISTING ladder (town_guard visit → state_enforcer raid → hand-off to
the wanted pipeline; heat FEEDS wanted, never replaces it). **The bribe wears the ruler's face** (the
de-clone rule): the Faith takes **tithes** in occupied FL · the Peach Combine sells a **COMPLIANCE
WAIVER** (a document item in your pack — searchable contraband elsewhere!) · the Knox Warlord takes
payment **in guns** · free counties get the actual crooked guard captain. One flavor column on the
bribe row; same formula (`bribe = 15 × heat`).

**§1.5 FREIGHT — the honest work** (owner: *"work for people driving cross-country delivering stuff"*).
Job boards at truck stops: haul a real crate exit-address to exit-address, paid by route distance ×
class × danger. Trust ladder DRIFTER→HAULER→CONTRACTOR; contraband runs consult the destination's law
(the smuggling fork is free). **Cargo shapes the driving** (v1 texture rows): **FRAGILE** (chassis
hits eat the pay — drive smooth) · **PERISHABLE** (races the heat-wave engine-cooking law) ·
**PASSENGER** (the client rides shotgun — the owner's line, literally). Lose the truck, lose the crate.

**§1.6 DELEGATION.** Underbosses = stationed crew or GROWN children; jobs off-screen vs their record:
collect / auto-bribe / defend. Loyalty is a bond float (the dog ladder); low loyalty skims and can be
bought — the betrayal beat. **THE LEDGER**: one EMPIRE tab (K) — per city: take, safe balance, heat,
underboss + loyalty, flags — and exactly three toggles per city. Every intervention beyond a toggle is
a DRIVE. **Money is physical**: collectors are NAVIGATION journeys with the satchel as a chest on the
body — kill one anywhere, by anyone (gator included), and the exact scrip drops where he fell;
interception works BOTH directions (rivals rob yours; you rob theirs off the honest atlas arcs).
**Rivals** are bandits.gd-style per-state directors accruing greed against your visible take.

## 2. THE FAMILY (the heart)

**§2.1 THE WIFE IS A PERSON.** Candidates are named PERSON rows met in the world — each with a real
TRADE (mechanic · medic · radio operator · fixer) that biases children's aptitudes and **works your
empire as a partner** (the radio operator reads grudge/heat intel; the mechanic keeps the fleet). She
has a schedule NAVIGATION actually walks (home → her shop → church — a visible life; the K sheet says
"at church"). Courtship = real verbs: gifts, jobs together, the `gold_ring` (120 scrip), the wedding
at `church_small` (exterior ceremony in the v1 slice). **She initiates** (the person-not-portrait
test, three row-driven channels): **ASK** (her wants surface on the radio — fulfilling one is a found
quest) · **WARN** (her trade speaks: the radio-op flags the ambush forming on your route) · **GIVE**
(leave home fed and a packed meal appears in your pack — the feed verb, reversed).

**§2.2 THE WEDDING IS EMERGENT, NEVER SCRIPTED.** Attack probability = deterministic terms the player
can read (a pre-wedding threat brief surfaces them — "the Knox crews are asking about the chapel";
armed guests visibly lower it). **The bandit term is gated on YOUR open ledger in that state** — a
clean-history player marries in peace; a noisy one invited the crash. Every wedding attacker resolves
to a **named grudge row** (0.4) — the widow arc always has a target. Guests are set-piece spawns, not
journeys (the NAV carve-out).

**§2.2b DATES & FAMILY LIFE (owner, 2026-07-09: "you have to take her someplace romantic… dinner
places… get your relationship thing up").** Courtship REQUIRES the romantic beat: stage one of any
courtship is a DATE at a `date_venue` row — the drive-in (a show night — shipped!), a dinner place
(diner_roadside cheap / `restaurant_fancy` proper), a scenic overlook (the M8 relief gives us these
free), or a SPECTACLE (take her to the races — SPECTACLES.md §3). Dates are real trips (drive there,
the venue verb runs, bond rises per venue tier + variety bonus — the same place twice pays half; she
has preferences by trade row, surfaced through her ASK channel). Married life keeps the verb: family
dinners at home (the stove) or out; anniversaries land on the calendar (miss them, the bond notices —
the dog guilt-nag law, humanized). **KIDS GO TO SCHOOL:** school-age children attend `school_small`
on a NAVIGATION schedule (walk/be-driven there — DRIVING THE KID TO SCHOOL is a real verb and feeds
the TEACH-wheel line); school raises the BOOKKEEPER/VOICE aptitude lanes (the enforcer lane grows in
the yard, not the classroom), school events roll on the calendar (recital = a date-class family beat;
trouble = a fetch-the-kid crisis ping under the attention law), and a town with your kid in its school
is a town you defend differently — the empire feels it.

**§2.3 CHILDREN.** Born, grow on the real clock (gestation ~2.4 real hours; GROWN at ~34 game-days ≈
13.6 real hours — the 60× childhood). Aptitudes inherit from BOTH parents' real skills + her trade
bias; paperdoll rows give visible resemblance. **Four specialist classes — the fourth is the game
itself:** the **BOOKKEEPER** (business boosts) · the **VOICE** (radio/social — recruits, sways law) ·
the **ENFORCER** (combat) · **THE WHEELMAN** (dad's `driving` feeds a `wheel` aptitude via the
TEACH-drive verb — kid in the passenger seat, the game's own skill loop; the only underboss who runs
routes without a hired driver, interception-survival bonus, and your getaway driver when a city
falls). Grown children take delegation seats.

**§2.4 MORTALITY, REVENGE, THE HOUSE.** Family members are MORTAL — the dog law exactly: no respawns,
a grave, a **memorial wall at the homebase**, the save remembers, and the killer becomes a grudge row
(both directions — rivals who lost people to YOU come for yours). Off-screen harm obeys the CRISIS LAW
(0.3): the radio flags it, the rescue window runs on the game clock, and the drive home is the race.
**The house can burn** (metaworld raid escalation; walls mitigate; a lost home is rebuilt at cost and
the family relocates) — *"a house in the middle of nowhere"* is a real strategic choice: remote = safe
from city heat, exposed to the wasteland's own pressure (the ecosystem doesn't care who you are).
**CLONING**: the full player-facing loop is now **docs/design/CLONING.md** (the clinic ritual,
wake-point choice, the MEMORY LAW + journal re-remember, black-market vats, and THE FAMILY LAW — you
don't lose your family, they lost YOU: grief, a bond hit scaled by backup staleness, strangers born
after your last scan, maybe your own grave at the memorial wall). Canon substrate stays
LIVING_WORLD_DSOA §11; **family members can NEVER be cloned** (§11.7 extended — permadeath is the
pillar; insurance never rescues the family, which is exactly why the crisis-law rescue drives matter
MORE for a cloned player).

## 3. Formulas (canonical; the road/building side owns `profit_day`)

`take_day = floor(profit_day × cut × staff_mult) + backroom_day` (cut .25/.50+.05·tier; staff 1−.15·missing,
floor .55) · `buy_in = profit_day × 25 × price_mult` (clamp .55–1.8) · `heat_day = Σ.4·attitude(extorted)
+ Σ.5(contraband) + events(+3 fight/+2 robbery/+8 takeover) − .5 decay` (thresholds 6/12/18) · `bribe =
15 × heat` (ruler-flavored collector) · `rob_odds = clamp(.04·route_danger·rival_strength·(1−.3·guard),
0,.5)` per leg-day · `share = (1·extorted + 2·owned + 3·seat)/(2N+3)` (flip ≥.6, revert <.45) ·
`grip = .5·share + .3·min(1,respect/40) + .2·uptime_7d` (seat at ≥.7) · `freight = ceil(km × rate{3/5/9}
× (1+.15·(danger−1)))` · `underboss uptime = .7+.1·loyalty_tier; skim = .2·(1−loyalty/100)·take` ·
`hold_odds = defense/(defense+attack)` · growth clocks: gestation 6 gd · stages to GROWN 34 gd ·
grudge heat ×.85/gd (a fresh grudge lives ~19 game-days). Worked examples live with their sims.

## 4. Edge cases (headlines)

Rob your own collector → zero gain, zero heat, "you paid yourself." Collector killed by wildlife →
satchel drops at the corpse, radio ping, 1-game-day window, then a rival claim roll. Wife in the car
during a firefight → she's a passenger with the seat law, and she REMEMBERS (bond hit; the WARN channel
gets sharper). Kid home during a raid → the crisis law, never silent death. Takeover while married to
a state-employed spouse → her trade re-employs under your law (a bark, not a system). Deposed ruler →
becomes a grudge-row rival with a siege calendar, not a deleted row. Save/load mid-anything → journeys,
downed clocks, grudges, tills all persist (the no-alt-F4 law).

## 5. Dependencies (bidirectional)

**Consumes:** NAVIGATION (every mover here is its client) · THE BUILDING BOOK (business fields,
entrances, church venue, seat compounds, the safe) · THE_AMERICAN_ROAD (addresses M3, street kits,
M9 capital seats, freight boards at truck stops) · LIVING_WORLD_DSOA (the locked five + §11 cloning) ·
SECURITY_LADDER (+ the proposed amnesty amendment) · respect.gd, rulers.json, law_profiles,
population cells (P0), carousel (the purge machine), metaworld (raids), events (calendars), dogs (the
bond blueprint + business guards) · THE LIBRARY (book ids cite its manifest; the wife's trade rows can
reference study perks). **Feeds:** POPULATION_WAR (player_family as a faction), the media layer (your
pirate station, takeover broadcasts), ECOSYSTEM (collector corpses are corpse_heat).

## 6. Sims

`business_sim` (pitch/extort/own/till/protection fight) · `collector_sim` (journey + satchel drop +
both-direction interception) · `delivery_sim` (freight pays the 0.1 pacing anchor) · `takeover_sim`
(seat machine end-to-end on a staged town) · `ruler_fall_sim` (three depose flavors resolve; the flip
broadcasts) · `delegate_sim` (the attention law: ≤N pings/day at 3 cities) · `family_sim` (courtship →
wedding → birth → growth → a specialist seat) · `wedding_sim` (exterior church_small; deterministic
threat terms; named attacker) · `grudge_sim` (fixed camp at the mark before arrival) · `home_raid_sim`
(the crisis law: downed record + rescue window + radio flag; death only on a blown clock) ·
`seat_roster_sim` (3 CEO states resolve) · `empire_save_sim` (everything round-trips).

**Phases:** **P0** (the shared workorder this arc OWNS: wire ProtoPopulation + fix the hanging
`population_cell_sim`) → **E1/F1 THE HOLLOWPOINT SLICE (0.2)** → E2 businesses full (gate: BUILDING
BOOK M3c fields) + F2 marriage+home → E3 collectors/freight ladder (gate: NAV-P2) + F3 children →
E4 the city (gate: M3 towns + P0) + F4 mortality/revenge → E5 the capital (gate: AMERICAN_ROAD M9
seats) + cloning wire-up. *Owner-flip flags: the safe's death-tax shelter (0.7) · family cloning
stays banned (§2.4) · revenge stays a drive (0.4).*
