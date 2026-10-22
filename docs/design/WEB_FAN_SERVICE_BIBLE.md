# DSOA web engine — the fan-service bible (clean-room)

**Status:** design reference, 2026-10-22. Study-room output (public sources only, nothing decompiled), written in our
words. The web engine (`web/`) is fan service for **GTA2, Autoduel/Car Wars, Project Zomboid, We're Alive, 28 Days Later
and James Axler's Deathlands** — it may borrow **mechanics, verbs, loops, counts and genre shapes**, never names, coined
slang, characters, plot specifics or catchphrases. `web/tools/ip-lint.mjs` enforces the names half (AGENTS.md invariant 8).

Binding canon this must fit: `docs/DIVIDED_STATES.md` (50 rulers, scrip, holdouts, THE CAROUSEL),
`docs/WORLD_PILLARS.md`, `docs/LORE_BIBLE.md` §6–7/13/18 and `docs/design/THE_INFECTED.md`:
**the word "zombie" is never used** — the infected are *living* bodies left by failed government treatment trials
(Shamblers, Sprinters, Echoes, Choir-Touched); Howlers own the night.

> ⚠️ The web engine still breaks that canon: its faction id is `'zombie'` and players see "Rotter"/"Runner". Display
> names must move to canon vocabulary (below); the internal id can stay `zombie` only if never shown.

## 1. What each source is loved for → our original version

### GTA2
| The shape fans love | Ours | Extends |
|---|---|---|
| 3 gangs per district, each at war with one and neutral to the other; one job moves two respect meters; low respect = shot on sight | **FEUD MATH** — each state is a triangle (its ruler + two rival families); a job raises one and lowers its enemy; at HOSTILE, checkpoints open fire | factions |
| Payphones ring with jobs, gated by respect | **LIVE WIRES** — dead payphones ring as you pass, routed by the old government switch; cold/warm/hot lines unlock by standing; some callers are the machine itself | director |
| Escalating heat tiers | **PAPER LADDER** — town bulls → county posse → state lockdown → skip tracers → Remnant drones → the machine's own convoy; every jurisdiction keeps its own warrants | wanted |
| Paid save points | **BOUGHT BEDS** — motel/chapel cots sell a respawn point; cheap beds risk theft overnight | death |
| Hidden timed kill quotas with a loaned weapon | **CULL TICKETS** — quarantine bounty slips on mile markers: 90 s, a loaned flamethrower or plow truck, paid per head | infected |
| 50 hidden collectibles; a job-streak multiplier | **BENCHMARKS** — 50 brass survey disks per state reveal its true roads; back-to-back jobs build a ×1–×5 pay streak | atlas |
| Respray clears heat | **PAINT & PLATES** — clears the vehicle half of a witness description, never your face | wanted |

### Autoduel / Car Wars
| Shape | Ours | Extends |
|---|---|---|
| Build a car on a budget: armor on 6 faces within weight/space | **SIX FACES** — armor per face (front/back/left/right/top/under); every plate costs acceleration and handling | vehicles |
| Weapons per face with firing arcs; rear droppers | **TAILGATE KIT** — arcs per mount; rear chutes: caltrops, oil, smoke, flares that fool drones | combat |
| Armor first, then the parts behind it; tyres targetable | **THE BREACH** — when a face's armor is gone, hits go to the parts on that side (the existing 5-part damage) | vehicles |
| A loaner arena night to win your first car | **PINK-SLIP NIGHT** — Indiana's Speedway Warlord lends junkers; survive the race, keep the title | onboarding |
| Courier runs between cities | **FREIGHT PAPER** — cargo, a deadline in game-hours, pay scaled to danger; law trust opens lawful runs, underworld trust contraband | director |
| Clone insurance | **LAST PULL** — a clinic records your skills for scrip; die and you wake there with those skills; bite fever blocks the recording | death |
| Salvage wrecks you made | **WRECK RIGHTS** — the last vehicle still moving owns the wreck; strip parts by condition or tow it; road families tax salvage on their roads | economy |

### Project Zomboid
| Shape | Ours | Extends |
|---|---|---|
| Infection odds by wound type; late symptoms | **THE WAIT** — graze/gash/bite ≈ 5/25/75% chance of fever after 6 silent game-hours *(a canon change: today every claw hit gives fever — Robert's call)* | survival |
| Utilities fail on a random day in a window | **BROWNOUT** — each holdout's power has a failure clock; nights go dark, prices jump, its TV channel dies | homebase |
| Noise events drag hordes across the map | **THE PULL** — drone flyovers, car alarms, convoy gunfights drag herds along a line; where they stop stays on the atlas as a herd trail | director |
| Stacking 4-tier status penalties; panic ruins aim | **WEAR** — 4-pip ladders: hunger, sleep, pain, temperature, nerve; low nerve widens spread (never call them "moodles") | survival |
| Skill media multiply XP; scheduled shows | **NIGHT SCHOOL** — how-to broadcasts at fixed hours give XP if tuned in; the Church jams them; no reruns | media |
| Keys or a skill-gated noisy hotwire | **COLD START** — a loud timed check, louder at low skill, while the herd turns | vehicles |
| Every run ends in a death with stats | **THE OBITUARY** — the radio airs one line built from your real stats; in Hardcore Legacy the next character hears it | death |

### We're Alive
| Shape | Ours | Extends |
|---|---|---|
| A fortified tower; everyone has a job; defended floor by floor | **ROOM DUTY** — base rooms with jobs (armory, grow room, infirmary, kennel) need crew; raids break in room by room | homebase |
| Small supply-run teams; not all return | **RUN BOARD** — send 2–3 crew off-screen; a roll on skill/vehicle/route danger returns loot, wounds or a map pin where a body lies | crew |
| Radio makes allies | **OPEN CHANNEL** — holdouts you helped give you a frequency and call when besieged | radio |
| The dead adapt | **THE HABIT** — use the same fence/door/route 3+ times and the Echoes there start working it | infected |
| The living are worse | **CLAIM JUMPERS** — a rival crew stakes your salvage ground: talk, pay a cut, or burn them out — they remember which | factions |
| Chapters narrated by characters | **LOGBOOK** — each sleep writes one line from real events; the radio can quote it after you die | UI |
| Community politics | **HOLDOUT VOTE** — past 8 residents, rationing/defense become morale-weighted votes; lose one and someone leaves with a truck | homebase |

### 28 Days Later
| Shape | Ours | Extends |
|---|---|---|
| Fast infected | canon Sprinters (**Burners**) + optional **SUNDOWNERS** night strain *(bends "Howlers own the night" — Robert's call)* | infected |
| A haven broadcast that's a trap; soldiers worse than the infected | **SWEET SIGNAL** — every haven call carries a hidden truth value; the Church fakes them with real holdout voices; you learn the tells | radio |
| Animals flee ahead | **THE QUIET** — birds lift, rats run, dogs balk 15 m before you see anything | dogs |
| The infected starve; waves | **BURNOUT SEASON** — half the sprinters in summer heat, double in winter | weather |
| A soldiers' quarantine line | **THE CORDON** — Remnant lines move weekly and close roads: detour, bribe or run it | roads |
| Roadside repairs in the dark | **ROADSIDE REPAIR** — tyres/belts/hoses: timed, two hands, loud | vehicles |

### Deathlands
| Shape | Ours | Extends |
|---|---|---|
| Random teleport jumps, jump sickness | canon **ROULETTE** + **BACKSPIN** — a no-key return to your last ring for one stack of ring-sickness | Carousel |
| Every town has a tyrant with a twisted law | **HOUSE RULES** — each holdout has 1–2 odd laws (guns checked at the gate, dogs leashed, a food tithe); break one → locally wanted | law |
| Armed trade convoys with a code | **FLANK PAY** — ride guard for pay per mile; break the code, lose the pay | convoy |
| Sealed pre-war caches | **COLD DEPOTS** — Old Union storehouses behind keys/codes; stale stock, 1 round in 12 a dud | loot |
| Hot spots, toxic storms | **HOT GROUND** — a dosimeter badge; dose cuts max HP until treated; refinery smoke fronts as weather | survival |
| A crew of specialists | **CREW CARDS** — one signature item and one flaw each, surfacing in events | crew |
| No common money | **FIFTY PAPERS** — every ruler prints scrip; the Swap discounts out-of-state paper by distance and standing | economy |

## 2. Vocabulary (ours)
| Slot | Ours |
|---|---|
| Currency | **scrip** (canon) — slang *paper*; one note a *stamp*; 100 a *brick*; another ruler's scrip *bad paper*; the exchange cut *the spread* |
| Curses | *Static!* / *God's static* · *eat static* (die) · *grid-dead* (broken) · *Black Week!* · *keyless* (a nobody) · *spun* (cracked) · *brownout* (a dim bulb) |
| The infected | THE INFECTED / HERD (canon); street name *the Treated* |
| Slow | **Calms** (canon Shamblers) |
| Fast | **Burners** (canon Sprinters); night strain **Sundowners** (optional, see above) |
| Climbers | **Echoes** (canon) |
| Summoners | **Criers** — an Echo strain bawling emergency-broadcast tones; herds within ~300 m gather; Choir-Touched stay the Carousel-site amplifier |
| Brutes | **Slabs** — the trial's heavy-lifting branch; slow until they shoulder a car off the road |
| Creatures (each a failed fix) | **Howlers** (canon) · **Rooters** (gene-edited feral hogs: dig up caches and graves) · **Tone dogs** (a police-dog program; answer machine tones) · **Sorebacks** (from Hanford/Oak Ridge/Trinity) · **Showcats** (roadside-zoo tigers, 11 years feral) |
| Teleport | THE CAROUSEL, Carousel Station, ring platform, access key (canon); a jump a *spin*; the sickness *ring-sick*; a misjump a *throw* (*smeared* if fatal); key forger *keycutter*; mechanic *ringhand*; a dead station a *cold ring* |
| Harpoon truck | shipped as **WHALER** (2026-10-22). Alternative on file: SNAG RIG, harpoon = *the gaff*. Low risk either way |
| Ex-police car | shipped as **LAWMAN** (not "Interceptor"); repaint it off black (the black ex-cop muscle car still reads as Max's) |
| Traders | **sutlers** (fixed post), **haulers** (convoy); the market **the Swap** |
| Enforcers | **bulls** (a ruler's muscle; retire "sec-man", it's Deathlands), **gatemen** (checkpoints), **skip tracers** (bounty hunters) |
| Town rulers | **Keyholder** (gate + water-valve + Carousel keys); the ruling family *the Keys*; states keep their canon ruler titles |

Real CB/trucker slang (hammer down, bobtail, deadhead, back door) is free folk vocabulary. Skip "Smokey" (protected by
federal law) and "Rubber Duck" as a handle (the song/film *Convoy*).

## 3. Ten "this world remembers me" events
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

## 4. IP landmines (beyond names)
- **Patent:** Warner Bros. holds US 10,926,179 (granted 2021, ≈ 2035–36) covering recurring "nemesis" enemies with
  forts, vendettas and followers. Keep our grudges to **one remembered rival per grudge — no rank promotions, no
  follower army** — and have a lawyer read the claims before shipping the world-memory rival features.
- **Title formula:** avoid "N days/years later/after" taglines (28 Days Later); "the Fracture" + a split USA echoes
  LucasArts' *Fracture* (2008) — keep "fracture" lowercase lore, not a title.
- **Trademarks in plain sight:** "Jet Ski" (Kawasaki — WaveRunner and Sea-Doo are taken too), Ford's "Police
  Interceptor", a real broadcaster's call sign (KDTH appears to be one).
- **Random-name collisions:** the name generator must skip famous pairs (Rosa Diaz, Ray Holt, Rosa Park…).
- **Code-only names:** our `lurker`, `charger`, `screamer` ids echo other franchises' creature names — fine as ids,
  never on screen. "misjump" is Traveller RPG vocabulary (low risk; *throw* is clean).
- The full deny/review vocabulary (≈ 250 terms incl. plurals and context rules) lives in `web/tools/ip-lint.mjs`.
