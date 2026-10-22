# DSOA web engine — the fan-service bible (clean-room)

**Status:** design reference, 2026-10-22. Restructured into the house 8-section format the same day; no row was dropped and
six were corrected (§3.2, §3.3). Facts checked against commit `6d09bd5` (IP pass 2) and the real lint file (§3.5).
**Owner of the call:** Robert. **Engine:** the three.js web engine (`web/`, see `web/AGENTS.md`).
**Method:** study-room output. Public sources only, nothing decompiled, written in our words.

---

## 1. Overview

The web engine (`web/`) is fan service for **GTA2, Autoduel/Car Wars, Project Zomboid, We're Alive, 28 Days Later and
James Axler's Deathlands**. It may borrow **mechanics, verbs, loops, counts and genre shapes**. It may never borrow
**names, coined slang, characters, plot specifics or catchphrases**. `web/tools/ip-lint.mjs` enforces the names half
(AGENTS.md invariant 8). This bible is the other half: for every shape fans love, the original version we build instead.

| Part | Where | What it holds |
|---|---|---|
| The borrowing test | §3.1 | three questions that decide whether something may cross |
| Verb translations | §3.2 | 41 rows over six sources: the loved shape, our original version, the engine system it extends |
| Vocabulary and display-name law | §3.3 | the words players read, and how a name earns the right to be on screen |
| World-memory events | §3.4 | ten "this world remembers me" events |
| IP landmines | §3.5 | everything beyond names (patent, titles, trademarks, collisions) with the status of each |
| Numbers and triggers | §4 | the few rules that are arithmetic, with worked examples |

**Binding canon this must fit:** `docs/DIVIDED_STATES.md` (50 rulers, scrip, holdouts, THE CAROUSEL),
`docs/WORLD_PILLARS.md`, `docs/LORE_BIBLE.md` §6–7/13/18 and `docs/design/THE_INFECTED.md`. **The word "zombie" is never
used.** The infected are *living* bodies left by failed government treatment trials (Shamblers, Sprinters, Echoes,
Choir-Touched); Howlers own the night.

**The canon break the first draft flagged is closed.** The web engine used to show "Rotter" and "Runner". Commit
`6d09bd5` ships **Shambler** and **Sprinter** as the display names. The internal faction id `zombie` stays, code-only,
and is never rendered (the lint ignores a lone lowercase token, so an id cannot false-alarm).

### 1.1 Decisions that stay Robert's call
Items 1, 2 and 4 are written into the tables below as proposals and stay off until he says yes. Item 3 shipped with a
fallback on file.
1. **THE WAIT** changes canon: today every claw hit gives fever (§3.2, Project Zomboid).
2. **SUNDOWNERS** bends "Howlers own the night" (§3.2, 28 Days Later).
3. **Harpoon-truck name:** WHALER shipped; SNAG RIG is on file (§3.3). Low risk either way.
4. **The nemesis patent:** a lawyer reads the claims before the world-memory rival features ship (§3.5, row 1).

## 2. Player Fantasy

*You are a stranger with a rig in a country that came apart. Every holdout is a small kingdom with one odd law and a long
memory. You play the ruling families against each other for pay, learn which gate bulls wave you through, and answer
payphones that ring for you. You armor a car one face at a time until it is ugly and perfect. You stay alive on a slow
clock of small bad decisions: a graze you hid, a noise at the wrong hour. A herd you pulled onto a gate shows up on the
map you carry. The radio promises a haven and you learn the tells that it might be a trap. When you finally die, the radio
tells your story back to the next driver.*

A fan of each source should recognise the shape inside twenty minutes, and never meet a borrowed name:

| If you love… | You should feel… | You must never see… |
|---|---|---|
| GTA2 | one job moves two respect meters at once; a ringing phone is a job; heat comes in rungs and every jurisdiction keeps its own file on you | a gang name, a death or arrest screen word |
| Autoduel / Car Wars | the car is a budget: armor on six faces, arcs for every weapon, a loaner night to win your first ride | a league, arena or club name |
| Project Zomboid | a slow clock punishes a small mistake long after you made it; every run ends in a short obituary | a status-effect nickname, the obituary slogan |
| We're Alive | a base with a job in every room, a radio full of voices, and living people who are worse than the dead | a gang or creature name from the series |
| 28 Days Later | fast infected, a haven broadcast that may be a trap, animals that flee before you see why | the virus name, an "N years after" tagline |
| Deathlands | tyrants with odd laws, a machine in the ground that throws you a thousand miles, scrip nobody else accepts | the novels' slang for the machine, the law or the people |

## 3. Detailed Rules

### 3.1 The borrowing test
Ask three questions of anything you add. Order matters.
1. **Is it a mechanic, verb, loop, count or genre shape?** It may cross. Write it as our own system, with our own name.
2. **Does it carry a name, coined word, character, plot beat, catchphrase or trademark from a source?** Replace it with
   our vocabulary (§3.3). If you cannot, drop it. The lint fails the obvious cases; the rest is your job.
3. **Does it rebuild a *system* someone holds a patent on?** Mechanics are not protectable in general, a patent is the
   exception. Check the landmine register (§3.5, row 1) before you build it.

### 3.2 Verb translations: what each source is loved for, and our original version

#### GTA2
| The shape fans love | Ours | Extends |
|---|---|---|
| 3 gangs per district, each at war with one and neutral to the other; one job moves two respect meters; low respect = shot on sight | **FEUD MATH** — each state is a triangle (its ruler + two rival families); a job raises one and lowers its enemy; at HOSTILE, checkpoints open fire | factions |
| Payphones ring with jobs, gated by respect | **LIVE WIRES** — dead payphones ring as you pass, routed by the old government switch; cold/warm/hot lines unlock by standing; some callers are the machine itself | director |
| Escalating heat tiers | **PAPER LADDER** — town bulls → county posse → state lockdown → skip tracers → Remnant drones → the machine's own convoy; every jurisdiction keeps its own warrants | wanted |
| Paid save points | **BOUGHT BEDS** — motel/chapel cots sell a respawn point; cheap beds risk theft overnight | death |
| Hidden timed kill quotas with a loaned weapon | **CULL TICKETS** — quarantine bounty slips on mile markers: 90 s, a loaned flamethrower or plow truck, paid per head | infected |
| 50 hidden collectibles; a job-streak multiplier | **BENCHMARKS** — 50 brass survey disks per state reveal its true roads; back-to-back jobs build a ×1–×5 pay streak | atlas |
| Respray clears heat | **PAINT & PLATES** — clears the vehicle half of a witness description, never your face | wanted |

#### Autoduel / Car Wars
| Shape | Ours | Extends |
|---|---|---|
| Build a car on a budget: armor on 6 faces within weight/space | **SIX FACES** — armor per face (front/back/left/right/top/under); every plate costs acceleration and handling | vehicles |
| Weapons per face with firing arcs; rear droppers | **TAILGATE KIT** — arcs per mount; rear chutes: caltrops, oil, smoke, flares that fool drones | combat |
| Armor first, then the parts behind it; tyres targetable | **THE BREACH** — when a face's armor is gone, hits go to the parts on that side (the existing 5-part damage) | vehicles |
| A loaner arena night to win your first car | **PINK-SLIP NIGHT** — Indiana's Speedway Warlord lends junkers; survive the race, keep the title | onboarding |
| Courier runs between cities | **FREIGHT PAPER** — cargo, a deadline in game-hours, pay scaled to danger; law trust opens lawful runs, underworld trust contraband | director |
| Clone insurance | **LAST PULL** — a clinic records your skills for scrip; die and you wake there with those skills; bite fever blocks the recording | death |
| Salvage wrecks you made | **WRECK RIGHTS** — the last vehicle still moving owns the wreck; strip parts by condition or tow it; road families tax salvage on their roads | economy |

#### Project Zomboid
| Shape | Ours | Extends |
|---|---|---|
| Infection odds by wound type; late symptoms | **THE WAIT** — graze/gash/bite ≈ 5/25/75% chance of fever after 6 silent game-hours *(a canon change: today every claw hit gives fever — Robert's call)* | survival |
| Utilities fail on a random day in a window | **BROWNOUT** — each holdout's power has a failure clock; nights go dark, prices jump, its TV channel dies | homebase |
| Noise events drag hordes across the map | **THE PULL** — drone flyovers, car alarms, convoy gunfights drag herds along a line; where they stop stays on the atlas as a herd trail | director |
| Stacking 4-tier status penalties; panic ruins aim | **WEAR** — 4-pip ladders: hunger, sleep, pain, temperature, nerve; low nerve widens spread (never call them "moodles") | survival |
| Skill media multiply XP; scheduled shows | **NIGHT SCHOOL** — how-to broadcasts at fixed hours give XP if tuned in; the Church jams them; no reruns | media |
| Keys or a skill-gated noisy hotwire | **COLD START** — a loud timed check, louder at low skill, while the herd turns | vehicles |
| Every run ends in a death with stats | **THE OBITUARY** — the radio airs one line built from your real stats; in Hardcore Legacy the next character hears it | death |

#### We're Alive
| Shape | Ours | Extends |
|---|---|---|
| A fortified tower; everyone has a job; defended floor by floor | **ROOM DUTY** — base rooms with jobs (armory, grow room, infirmary, kennel) need crew; raids break in room by room | homebase |
| Small supply-run teams; not all return | **RUN BOARD** — send 2–3 crew off-screen; a roll on skill/vehicle/route danger returns loot, wounds or a map pin where a body lies | crew |
| Radio makes allies | **OPEN CHANNEL** — holdouts you helped give you a frequency and call when besieged | radio |
| The dead adapt | **THE HABIT** — use the same fence/door/route 3+ times and the Echoes there start working it | infected |
| The living are worse | **CLAIM JUMPERS** — a rival crew stakes your salvage ground: talk, pay a cut, or burn them out — they remember which | factions |
| Chapters narrated by characters | **LOGBOOK** — each sleep writes one line from real events; the radio can quote it after you die | UI |
| Community politics | **HOLDOUT VOTE** — past 8 residents, rationing/defense become morale-weighted votes; lose one and someone leaves with a truck | homebase |

#### 28 Days Later
| Shape | Ours | Extends |
|---|---|---|
| Fast infected | canon **Sprinters** (the shipped display name) + optional **SUNDOWNERS** night strain *(bends "Howlers own the night" — Robert's call)* | infected |
| A haven broadcast that's a trap; soldiers worse than the infected | **SWEET SIGNAL** — every haven call carries a hidden truth value; the Church fakes them with real holdout voices; you learn the tells | radio |
| Animals flee ahead | **THE QUIET** — birds lift, rats run, dogs balk 15 m before you see anything | dogs |
| The infected starve; waves | **BURNOUT SEASON** — half the sprinters in summer heat, double in winter | weather |
| A soldiers' quarantine line | **THE CORDON** — Remnant lines move weekly and close roads: detour, bribe or run it | roads |
| Roadside repairs in the dark | **ROADSIDE REPAIR** — tyres/belts/hoses: timed, two hands, loud | vehicles |

#### Deathlands
| Shape | Ours | Extends |
|---|---|---|
| Random teleport jumps, jump sickness | canon **ROULETTE** + **BACKSPIN** — a no-key return to your last ring for one stack of ring-sickness | Carousel |
| Every town has a tyrant with a twisted law | **HOUSE RULES** — each holdout has 1–2 odd laws (guns checked at the gate, dogs leashed, a food tithe); break one → locally wanted | law |
| Armed trade convoys with a code | **FLANK PAY** — ride guard for pay per mile; break the code, lose the pay | convoy |
| Sealed pre-war caches | **COLD DEPOTS** — Old Union storehouses behind keys/codes; stale stock, 1 round in 12 a dud | loot |
| Hot spots, toxic storms | **HOT GROUND** — a dosimeter badge; dose cuts max HP until treated; refinery smoke fronts as weather | survival |
| A crew of specialists | **CREW CARDS** — one signature item and one flaw each, surfacing in events | crew |
| No common money | **FIFTY PAPERS** — every ruler prints scrip; the Swap discounts out-of-state paper by distance and standing | economy |

### 3.3 Vocabulary (ours) and the display-name law
| Slot | Ours |
|---|---|
| Currency | **scrip** (canon) — slang *paper*; one note a *stamp*; 100 a *brick*; another ruler's scrip *bad paper*; the exchange cut *the spread* |
| Curses | *Static!* / *God's static* · *eat static* (die) · *grid-dead* (broken) · *Black Week!* · *keyless* (a nobody) · *spun* (cracked) · *brownout* (a dim bulb) |
| The infected | THE INFECTED / HERD (canon); street name *the Treated* |
| Slow | **Shamblers** (canon, shipped in `6d09bd5`); optional street slang **Calms**, from the Calm Protocol that made them |
| Fast | **Sprinters** (canon, shipped in `6d09bd5`); night strain **Sundowners** (optional, see §3.2). Never "Burners" (§3.5, row 6) |
| Climbers | **Echoes** (canon) |
| Summoners | **Criers** — an Echo strain bawling emergency-broadcast tones; herds within ~300 m gather; Choir-Touched stay the Carousel-site amplifier |
| Brutes | **Slabs** — the trial's heavy-lifting branch; slow until they shoulder a car off the road |
| Creatures (each a failed fix) | **Howlers** (canon) · **Rooters** (gene-edited feral hogs: dig up caches and graves) · **Tone dogs** (a police-dog program; answer machine tones) · **Sorebacks** (from Hanford/Oak Ridge/Trinity) · **Showcats** (roadside-zoo tigers, 11 years feral) |
| Teleport | THE CAROUSEL, Carousel Station, ring platform, access key (canon); a jump a *spin*; the sickness *ring-sick*; a misjump a *throw* (*smeared* if fatal); key forger *keycutter*; mechanic *ringhand*; a dead station a *cold ring* |
| Harpoon truck | shipped as **WHALER** (`90fb173`, 2026-10-22). Alternative on file: SNAG RIG, harpoon = *the gaff*. Low risk either way |
| Ex-police car | shipped as **LAWMAN** (`90fb173`; not "Interceptor"); the town car was repainted faded brown in `6d09bd5` (the black ex-cop muscle car still reads as Max's) |
| Watercraft | the small fast boat ships as **WATERBIKE** (`6d09bd5`); never "jet ski", "WaveRunner" or "Sea-Doo" |
| Radio | the last station in Arizona broadcasts on **STATIC 1660 AM** (`6d09bd5`); never a real call sign |
| Traders | **sutlers** (fixed post), **haulers** (convoy); the market **the Swap** |
| Enforcers | **bulls** (a ruler's muscle; retire "sec-man", it's Deathlands), **gatemen** (checkpoints), **skip tracers** (bounty hunters). Never "Regulators" (§3.5, row 7) |
| Town rulers | **Keyholder** (gate + water-valve + Carousel keys); the ruling family *the Keys*; states keep their canon ruler titles |

Real CB/trucker slang (hammer down, bobtail, deadhead, back door) is free folk vocabulary. Skip "Smokey" (protected by
federal law) and "Rubber Duck" as a handle (the song/film *Convoy*).

**Display-name law.** A name a player can read earns its place by these rules:
1. It comes from this table, from a canon doc, or from our own row lists (names, towns, shops, signs).
2. An internal id may keep an old code name only if it is a lone lowercase token (`zombie`, `jetski`, `interceptor`) and
   is never rendered. Anything capitalised, spaced or punctuated is display text and is scanned.
3. Command and argument names (`horde runners=`, `zombies`) are developer-facing ids. Their **descriptions** are strings in
   `src/agent/api.js`, so they are scanned and use canon words.
4. A name composed at runtime (a person, a place, a sign) must carry its own skip list, as `randomName` does (§3.5, row 8).

### 3.4 Ten "this world remembers me" events
| Event | Trigger | Spawns | Written back |
|---|---|---|---|
| **YOUR RIG, THEIR COLORS** | your vehicle left in a road family's land ≥ 1 game-day | it patrols in their paint, odometer intact; the radio brags | joins their roster; taking it back costs standing |
| **SCORE TO SETTLE** | a raider boss escapes you under 30% HP, or you flee his ambush | he returns scarred, extra armor on the side you shot; a bounty | one rival record (name, scars, tally) — see the patent note |
| **WANTED, WITH YOUR PAINT** | a witness reaches a holdout | posters with your vehicle's color/model/plates; skip tracers work the state's roads | until PAINT & PLATES or a pardon; killing the witness is a new crime |
| **ANSWERED OR NOT** | a holdout mayday, 6 game-hours | help → gate opens, discount, your rig on their water tower, a volunteer | ignore → it falls, its mayday loops, nearby holdouts colder |
| **THE HERD YOU PULLED** | your noise drags a 20+ herd into a holdout/checkpoint | breached walls, deaths, a herd-crossing sign | standing loss; the herd trail stays days; pulling one away earns credit |
| **CROWS ON THE CUT** | you die | your lost share cached under circling crows (or in a road family's strongbox next day) | the radio spreads where you fell |
| **THE LITTER** | a bonded dog dies after 7+ days kenneled with a holdout dog | weeks later a pup with the same coat near the grave | lineage record; one bond tier up, knows one whistle |
| **YOUR HAND IN THE TAKEOVER** | your jobs push one ruler past a neighbor (FEUD MATH) | bulletin; checkpoints change colors; laws change | state owner changes; the loser marks you HUNTED |
| **THE MACHINE KNOWS YOUR PLATE** | third Carousel node lit or tenth jump | station boards show your plate in glyphs; a drone shadows you | an "anomaly" value later events react to |
| **ROAD NAME** | 1,000 miles + 25 kills on one road, or escaping the Crimson Road 3× | barks and radio use an earned nickname; a title race | the road records you as its legend |

### 3.5 IP landmines (beyond names)
The lint catches the names it has been taught. These are the traps beyond a word list, with their status. **RESOLVED** rows
name the commit.

| # | Landmine | Why it matters | Status |
|---|---|---|---|
| 1 | **Patent.** Warner Bros. holds US 10,926,179 (granted 2021, ≈ 2035–36) covering recurring "nemesis" enemies with forts, vendettas and followers | SCORE TO SETTLE is the closest rule we have | **OPEN, policy in force.** One remembered rival per grudge: no rank promotions, no follower army. A lawyer reads the claims before the world-memory rival features ship |
| 2 | **Title formula.** Avoid "N days/years later/after" taglines (28 Days Later). "The Fracture" plus a split USA echoes LucasArts' *Fracture* (2008): keep "fracture" lowercase lore, not a title | the title screen is the first line a player reads | **RESOLVED `6d09bd5`.** The tag is now "THE UNION IS GONE. THE ROADS REMAIN." No "N years after", no capitalised Fracture |
| 3 | **"Jet Ski"** is Kawasaki's trademark (WaveRunner and Sea-Doo are taken too) | a vehicle name on the HUD | **RESOLVED `6d09bd5`.** Renamed WATERBIKE; the id `jetski` stays internal |
| 4 | **Ford's "Police Interceptor"** | the ex-police car's name | **RESOLVED `90fb173`.** Shown as LAWMAN; `interceptor` survives only as an id, allow-listed in `ip-allow.json` |
| 5 | **A real broadcaster's call sign** (KDTH appears to be one) | the radio DJ's greeting | **RESOLVED `6d09bd5`.** The DJ broadcasts on STATIC 1660 AM; `kdth` is now a DENY term |
| 6 | **"Burners"** was proposed for fast infected in the first draft | the Burners are a gang in the audio drama *We're Alive*. A fast-infected name that matches a gang name from a source is a borrowed name, and fans would read it as one | **REMOVED.** The fast infected are Sprinters (canon, shipped `6d09bd5`). `burner` and `burners` sit on the lint's REVIEW list for the same reason |
| 7 | **"Regulators"** is a faction name in *Fallout 3* | it is the obvious word for town enforcers | **OPEN, new rule.** Never use it for enforcers; use **bulls**, **gatemen**, **skip tracers** (§3.3). Zero hits in `web/` today. Add `regulator` and `regulators` to the lint's REVIEW list (an ordinary English word, so not DENY) |
| 8 | **Random-name collisions.** The name generator must skip famous pairs | a famous name on a random NPC reads as a reference we did not mean | **RESOLVED `6d09bd5`.** `randomName` rolls again (up to 6 times) when the pair is on its famous list (Rosa Diaz, Ray Holt, Rosa Park, Ray Park, Ray Price, Bo Diaz, Lena Park), then falls back to a safe name |
| 9 | **A look-alike vehicle.** The black ex-cop muscle car reads as Max's | the town's parked LAWMAN | **RESOLVED `6d09bd5`.** The town LAWMAN is faded brown (`#4a3a2a`), never black |
| 10 | **Code-only names.** Our `lurker`, `charger`, `screamer` ids echo other franchises' creature names. "misjump" is Traveller RPG vocabulary (low risk; *throw* is clean) | ids are fine, screens are not | **OPEN, policy.** Fine as ids, never on screen. `lurker`, `charger`, `screamer` are on the REVIEW list |
| 11 | **CB slang.** "Smokey" is protected by federal law; "Rubber Duck" as a handle is the song/film *Convoy* | the haulers' radio chatter | **OPEN, policy.** Skip both (§3.3); the rest of trucker slang is free |

**How big the lint is.** `web/tools/ip-lint.mjs` holds **183 terms**: 151 DENY (15 groups) and 32 REVIEW (7 groups).
Plurals and spelling variants are counted separately. The first draft of this bible said "≈ 250 terms incl. plurals and
context rules"; that was wrong, there is no context-rule engine, and the real number is 183 (counted 2026-10-22).

## 4. Formulas

Most of this bible is vocabulary. These are the rules that are arithmetic. Anything not set here is owned elsewhere:
**FEUD MATH, PAPER LADDER, SCORE TO SETTLE and WANTED WITH YOUR PAINT** take their standing, tier and rumor formulas from
`docs/design/WEB_WORLD_MEMORY.md` §4 (standing change `Δ = clamp(value · m · learn, −60, 60)`, tiers at −80/−40/−10/20/60).
A value marked *proposed* is not in the first draft of this bible or in canon; it exists so the rule can be tested.

**F1 — Lint match (the IP gate).**
`hit(t, s) = s_clean matches /(?<![a-z0-9])t(?![a-z0-9])/i`, where `s_clean` is the string with markup tags removed.
A string is skipped if it is a lone lowercase token (`^[a-z][a-zA-Z0-9_]*$`) or a module path (`^\.{1,2}/[\w./-]+$`).
Verdict: exit 1 if any DENY term hits, else 0. REVIEW hits are printed and never fail.
- `t`: one of 183 terms. `s`: a string literal in `src/**` or `content/**`, or visible text in `index.html` (comments and
  identifiers are not strings).
- Range: deny hits ≥ 0, ship gate = 0.
- Example: a command description reading "Spawn a horde of Rotters (zombies)" hits `rotters` and `zombies` → 2 deny, exit 1.
  The faction key `'zombie'` is a lone lowercase token → skipped. `DEATH<span>LANDS</span>` → tags stripped → `DEATHLANDS`
  hits `deathlands`.

**F2 — Pay streak (BENCHMARKS' multiplier).**
`payout = base · m`, `m = clamp(n, 1, 5)`, where `n` = jobs completed back to back (first job `n = 1`).
- Range: `m ∈ [1, 5]`. *Proposed:* declining or failing a job resets `n` to 0.
- Example: base 60 scrip. 4th job in a row: `60 · 4 = 240`. 7th: `m = min(7, 5) = 5`, so `300`.

**F3 — Fever odds (THE WAIT, a canon change pending Robert).**
`P(fever) = 1 − Π (1 − p_k)` over every untreated wound `k`, with `p_graze = 0.05`, `p_gash = 0.25`, `p_bite = 0.75`. Fever
shows after `T_wait = 6` silent game-hours. *Proposed:* wounds are independent.
- Range: `[0, 1]`. A single bite (0.75) already makes fever likelier than not.
- Example: a graze and a gash: `1 − 0.95 · 0.75 = 0.2875` (28.8%). Two bites: `1 − 0.25² = 0.9375`.

**F4 — Fast infected per season (BURNOUT SEASON).**
Per-body roll at herd spawn: `p = share · f_season`, `f_summer = 0.5`, `f_spring = f_autumn = 1`, `f_winter = 2`.
A herd of `n` bodies has `P(≥ 1 sprinter) = 1 − (1 − p)^n`. The canon cap of 1–2 sprinters per herd still applies.
- `share` is read from `docs/design/THE_INFECTED.md` (Sprinter `0.0050`), never set here.
- Range: `p ∈ [0, 0.01]` at the shipped shares.
- Example: a herd of 80. Spring: `1 − 0.995^80 = 0.330`. Summer: `1 − 0.9975^80 = 0.181`. Winter: `1 − 0.99^80 = 0.553`.

**F5 — The quiet radius (THE QUIET).**
`R_quiet = d_see + 15 m`, where `d_see` is the player's sight distance to that threat (`sight` in `WEB_WORLD_MEMORY` §4).
Birds lift, rats run and dogs balk when a threat is inside `R_quiet` and outside `d_see`.
- Range: `d_see` 6–50 m, so `R_quiet` 21–65 m.
- Example: noon, clear, standing: `42 + 15 = 57 m`. 23:00 (night 0.95), crouched: `sight = lerp(42,16,0.95)·0.6 = 10.4`, so `R_quiet = 25.4 m`.

**F6 — Stale stock (COLD DEPOTS).**
`P(dud) = 1/12 ≈ 0.083` per round. For `m` rounds loaded: `P(≥ 1 dud) = 1 − (11/12)^m`. Expected duds in `n` rounds: `n/12`.
- Range: `[0, 1]`; 0.083 for a single round.
- Example: a 6-round cylinder: `1 − (11/12)^6 = 0.407`, about four in ten hide a dud. A 30-round box holds 2.5 duds on average.

**F7 — Scrip units and the spread (FIFTY PAPERS).**
`1 brick = 100 stamps`. Out-of-state paper at the Swap: `value = face · (1 − spread)`.
Shape: `spread` rises with border distance and falls with standing, floored at 0, capped at 0.5 *(proposed cap)*. The economy
owner sets the slope; this bible fixes only the units and the shape.
- Example: 300 stamps of bad paper at `spread = 0.2` → `240` stamps = 2.4 bricks.

**F8 — Numeric triggers (§3.2 and §3.4).** Each is a predicate; every threshold is a knob in §7. The other three events
(WANTED, WITH YOUR PAINT; CROWS ON THE CUT; YOUR HAND IN THE TAKEOVER) fire on a state change, not a number.

| Event | Fires when | Example |
|---|---|---|
| YOUR RIG, THEIR COLORS | `t_parked ≥ 1 game-day` inside a road family's land | parked 30 game-hours: fires. 20: does not |
| SCORE TO SETTLE | `hp_boss / hp_max < 0.30` when he escapes, or the ambush was fled | boss at 28%: fires. At 31%: no record |
| ANSWERED OR NOT | `t_since_mayday ≥ 6 game-hours` with no answer | answered at 5.5 h: gate opens. At 6.5 h: the holdout falls |
| THE HERD YOU PULLED | `herd_size ≥ 20` dragged into a holdout or checkpoint | 19 bodies: no event. 20: breach |
| THE LITTER | bonded dog dies and `days_kenneled ≥ 7` | 6 days: no pup. 7: a pup near the grave |
| THE MACHINE KNOWS YOUR PLATE | `nodes_lit ≥ 3` or `jumps ≥ 10` | 2 nodes and 9 jumps: nothing. The 10th jump: fires |
| ROAD NAME | `(miles ≥ 1000 and kills ≥ 25)` on one road, or `escapes(Crimson Road) ≥ 3` | 1,200 miles and 24 kills: not yet |
| HOLDOUT VOTE | `residents > 8` | 8: the ruler decides. 9: morale-weighted vote |

## 5. Edge Cases

**The lint**
- **A DENY term in a player-facing string:** the lint prints file, line, term and source, and exits 1. AGENTS.md invariant 8
  says 0 deny before a commit, so the commit waits until the string is renamed. A deliberate exception goes in
  `tools/ip-allow.json` as `{term, file, why}`, with a reason. Today there are 2 entries (`deathlands` in `src/ui/qol.js`, a
  one-time storage migration that is read and never shown; `interceptor` for every file, an internal id).
- **A REVIEW term:** printed, exit stays 0. A human decides from the context. "WASTED" or "BUSTED" on a death or arrest
  screen must change; a vehicle called "Interceptor" must change; the id `interceptor` is allow-listed.
- **A lone lowercase token** (`'zombie'`, `'jetski'`): skipped as an id. The same word capitalised or inside a sentence
  (`'Zombie'`, `'a jet ski'`) is display text and is scanned.
- **Markup hiding a word** (`DEATH<span>LANDS</span>`): tags are stripped before matching, so it is caught.
- **A banned word in a code comment or a variable name:** the lint does not see it and passes. It still must not reach a
  screen; reviewers check it.
- **A `${...}` expression in a template literal:** its text is scanned like the rest of the string. An identifier inside that
  collides with a term → a false positive. Rename the identifier, or add a scoped allow-list entry with a reason.
- **A name composed at runtime** (person, place, sign): the lint sees the parts, never the result. Each generator carries its
  own skip list and rolls again (`randomName`: up to 6 times, then a safe fallback). The streamed world's place and sign
  generators must do the same (`WEB_STREAMING.md`).
- **Content registered at runtime** (`registerVehicle`, `registerNpc` through the agent API): never reaches the lint, only
  committed `src/` and `content/` files do. The agent that registers a name owns the check; run the lint before a pack is committed.
- **Real brands on generated signage and shops:** the lint knows only its 33 trademark terms. Sign, shop and billboard text
  comes from our own row lists; a reviewer reads any new list by eye.

**The rules**
- **A proposal that bends canon** (THE WAIT, SUNDOWNERS): stays off. Until Robert says yes, claw hits still give fever and no
  Sundowner spawns. Nothing ships behind a name the tables mark as *Robert's call*.
- **A rival who escapes twice** (SCORE TO SETTLE), by the patent policy: the same single record gains scars and tally. It never
  gets a rank, a lieutenant or followers. If the rival dies the record closes; there is no heir. Leaders change only from an
  authored successor list (`WEB_WORLD_MEMORY` §3.6).
- **Rival features before counsel has read the patent:** they stay behind a dev flag and are not in a public build.
- **A holdout with exactly 8 residents:** no vote; its ruler sets rationing and defense as before (§4, F8). The vote starts at 9.
- **Two §3.4 events firing on the same tick** *(proposed)*: both are recorded. Each writes its own "written back" line; neither
  cancels the other. A death (CROWS ON THE CUT) does not stop a running mayday timer; the world does not wait for you.
- **Real CB slang that is also protected** ("Smokey", "Rubber Duck" as a handle): not used. The rest of trucker slang is free.

## 6. Dependencies

Bidirectional: the right-hand columns say what each side needs from the other.

| Doc / system | What it needs from this bible | What this bible needs from it |
|---|---|---|
| `web/AGENTS.md` (invariant 8) | the rule "borrow mechanics, never names" and the landmine register | the lint-before-commit rule; a pointer to this file *(AGENTS.md does not link it yet)* |
| `web/tools/ip-lint.mjs` | the vocabulary and landmine rules, as DENY / REVIEW terms | enforcement of the names half: 183 terms today |
| `web/tools/ip-allow.json` | the rule that every exception carries a `why` | 2 entries today, both with reasons |
| `docs/DIVIDED_STATES.md`, `docs/WORLD_PILLARS.md`, `docs/LORE_BIBLE.md` | each borrowed mechanic fits canon (scrip, holdouts, Carousel, the 50 rulers) | the canon facts; "fracture" stays lowercase lore |
| `docs/design/THE_INFECTED.md` | the canon names Shambler / Sprinter / Echo / Choir-Touched; BURNOUT SEASON and SUNDOWNERS are proposals to it | the shares (0.9935 / 0.0050 / 0.0010 / 0.0005) and the sprinter rules |
| `docs/design/WEB_WORLD_MEMORY.md` | the verbs FEUD MATH, PAPER LADDER, SCORE TO SETTLE, WANTED WITH YOUR PAINT, and the patent policy | it is their home: standing, tier and rumor formulas (§4 there); its leaders-by-successor-list rule |
| `docs/design/WEB_STREAMING.md` | the vocabulary and the no-brand rule for every generated name (towns, exits, signs, billboards); COLD DEPOTS, BENCHMARKS, LIVE WIRES and THE CORDON need streamed places and closable roads | stable place and exit ids, chunk-streamed placements, an edge on the road graph that can be closed, a skip list in each name generator |
| `docs/RESUME_WEB_ENGINE.md`, `docs/WEB_ENGINE_PLAN.md` | the mechanics backlog (survival, inventory, role system) maps onto these rows | the build order |
| `web/src/systems/zombies.js`, `systems/vehicles.js`, `data/npcs.js`, `main.js` (title screen) | the display names in §3.3 | they hold the shipped names |

## 7. Tuning Knobs

*Source* says where the default comes from: **bible** (stated in the first draft), **code** (a constant in the repo) or
**proposed** (added so the rule can be tested; needs Robert's yes). No balance pass has run on any of these.

| Knob | Default | Safe range | Affects | Source |
|---|---|---|---|---|
| Fever odds (graze / gash / bite) | 5 / 25 / 75 % | 2–10 / 15–35 / 60–95 | how hard hiding a wound is; what antibiotics are worth | bible (canon change pending) |
| Silent delay before fever | 6 game-hours | 3–12 | the window to find a cure | bible |
| Pay-streak cap | ×5 | ×3–×8 | how much chaining jobs pays against what it risks | bible |
| Streak break | decline or fail a job | decline only / fail only / a day passes | how forgiving streaks feel | proposed |
| Cull-ticket timer | 90 s | 60–150 | panic against fairness | bible |
| Benchmarks per state | 50 | 25–75 | exploration time; 48 states makes 2,400 at the default | bible |
| Quiet lead | 15 m | 8–30 | how early animals warn you | bible |
| Crier gather radius | 300 m | 150–500 | how far one scream draws a herd | bible |
| Season factor (summer / winter) | ×0.5 / ×2 | 0.25–0.75 / 1.5–3 | how often a sprinter shows up per season | bible |
| Dud rate | 1 in 12 | 1 in 30 to 1 in 6 | how much stale stock hurts | bible |
| Holdout vote threshold | > 8 residents | 5–12 | when a holdout stops being a monarchy | bible |
| Run-board crew | 2–3 | 2–4 | risk and reward of off-screen runs | bible |
| Habit uses | 3+ | 2–6 | how fast Echoes learn your route | bible |
| SCORE TO SETTLE escape HP | 30 % | 15–40 | how often a boss returns | bible |
| Rig left behind | ≥ 1 game-day | 0.5–3 days | how fast the road claims your car | bible |
| Mayday window | 6 game-hours | 3–12 | the time you have to answer a holdout | bible |
| Herd pulled | ≥ 20 | 10–40 | what counts as a herd worth a consequence | bible |
| Litter kennel time | ≥ 7 days | 3–14 | how long a dog must live among holdout dogs | bible |
| Machine-knows trigger | 3rd node or 10th jump | 2–4 / 6–15 | when the machine starts watching | bible |
| Road-name trigger | 1,000 miles + 25 kills, or 3 escapes | 500–2,000 / 10–50 / 2–5 | how rare a legend is | bible |
| Swap spread cap | 0.5 | 0.3–0.7 | how bad bad paper can get | proposed |
| `randomName` retries | 6 | 3–10 | how often the fallback name appears | code |
| Famous-pair list | 7 pairs | add freely | how many of the 300 name combinations are excluded | code |
| Lint lists | 151 DENY + 32 REVIEW | add freely; move REVIEW to DENY only for terms with no innocent use | false-positive rate against coverage | code |
| Optional flags: SUNDOWNERS, THE WAIT canon change | off | on only with Robert's yes | whether a canon-bending rule ships | owner |
| Calms slang | on | on / off | purely cosmetic street talk | owner |

## 8. Acceptance Criteria

Each item passes or fails. Run from `web/` unless a path says otherwise; `node tools/dl.mjs` needs the game running
(`npm run agent`, see AGENTS.md).

1. **Lint gate.** `node tools/ip-lint.mjs` (from the repo root: `node web/tools/ip-lint.mjs`) prints `ip-lint: 0 deny` and the shell exit code is 0. *(Today: `0 deny, 0 review — clean`.)*
2. **Machine-readable gate.** `node tools/ip-lint.mjs --json` returns `"ok": true` and `"deny": []`.
3. **Term count matches this document.** From the repo root, in a POSIX shell:
   `node -e "const s=require('fs').readFileSync('web/tools/ip-lint.mjs','utf8');const n=b=>{const i=s.indexOf('export const '+b+' = {');let d=0,j=s.indexOf('{',i);const k=j;for(;;j++){if(s[j]=='{')d++;if(s[j]=='}'&&!--d)break}return Object.values(eval('('+s.slice(k,j+1)+')')).flat().length};console.log(n('DENY'),n('REVIEW'))"`
   prints `151 32` (total 183). If it prints anything else, §3.5, §6 and §7 are stale: update them in the same commit.
4. **Infected names on screen.** `node tools/dl.mjs exec code="(async()=>{await DL.horde({count:20,runners:0.5}); const r=await DL.query({type:'char',faction:'zombie',radius:200,limit:40}); return r.items.map(c=>c.name).filter(n=>!['Shambler','Sprinter'].includes(n))})()"`
   returns `"value": []`. No Rotter, Runner, Zombie, Burner or Sundowner.
5. **Vehicle names.** `node tools/dl.mjs spawnVehicle type=jetski` returns `"name": "WATERBIKE"`; `spawnVehicle type=interceptor`
   returns `"name": "LAWMAN"`.
6. **Title tag.** `grep -c "THE UNION IS GONE. THE ROADS REMAIN." src/main.js` prints `1`, and
   `grep -rniE "years after|days later|the fracture" src index.html content` prints nothing.
7. **Radio.** `grep -c "STATIC 1660 AM" src/data/npcs.js` prints `1` or more, and `grep -rniE "kdth" src content index.html` prints nothing.
8. **Town car paint.** `grep -n "spawn('interceptor'" src/main.js` shows a paint that is not black (`#4a3a2a` today; the old `#1c1f24` fails).
9. **Name generator.** This prints `0`:
   `node --input-type=module -e "const {randomName}=await import('./src/data/npcs.js');const {makeRng}=await import('./src/engine/rng.js');const r=makeRng(1);const bad=['Rosa Diaz','Ray Holt','Rosa Park','Ray Park','Ray Price','Bo Diaz','Lena Park'];let h=0;for(let i=0;i<20000;i++)if(bad.includes(randomName(r)))h++;console.log(h)"`
10. **No borrowed enforcer or fast-infected names.** `grep -rniE "regulator|burner" src content index.html` prints nothing.
11. **Allow-list hygiene.** `node -e "console.log(require('./tools/ip-allow.json').filter(x=>!x.why||!x.why.trim()).length)"` prints `0`.
12. **Document shape.** `grep -c "^## " ../docs/design/WEB_FAN_SERVICE_BIBLE.md` prints `8`, and the headings read Overview,
    Player Fantasy, Detailed Rules, Formulas, Edge Cases, Dependencies, Tuning Knobs, Acceptance Criteria in that order.
13. **Landmine register is current.** Rows 2–5, 8 and 9 of §3.5 each name a commit that `git log --oneline` shows; row 7 stays OPEN
    until `regulator` and `regulators` are on the lint's REVIEW list (then the term count in item 3 becomes `151 34`, total 185).
