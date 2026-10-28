# GENRE DEPTH — Divided States of America

**Research doc · 2026-10-27 · mechanics study, clean-room**

What the best games in this genre do, what players keep asking for, and a concrete proposal for DSOA's stat, crew, base, horde, AI and multiplayer systems.

**Rule for this doc:** we take *mechanics*, not names. Every system below is renamed and re-numbered for DSOA. "Inspired by" lines say which game proved the idea works. They are not things to copy. We don't use any franchise's attribute acronyms, perk names, status-icon brand terms or item names.

**Sources and confidence.** Exact formulas from shipped games are often undocumented. Where a number comes from a wiki or fan source it's marked *(reported)*. All other numbers are **our proposal**, set for a top-down real-time game with a crew of 1–6, and they need tuning in playtests. Sources are listed at the end.

---

## 0. The design spine (read this first)

Three things set this genre's winners apart from its forgettable games:

1. **People are the resource, not loot.** Players remember the medic who lost a hand, not the rifle. (Kenshi, Battle Brothers, State of Decay, Rimworld, Jagged Alliance 2.)
2. **The world pushes back on a clock.** A blood moon, plague hearts, a horde migration, a raid timer. Without pressure, base-building is just interior decorating. (7 Days to Die, State of Decay 2, Rimworld.)
3. **Systems talk to each other.** Noise from a gun brings the horde. The horde destroys the generator. Losing power drops morale, and morale makes the cook quit. Every stat should touch at least two other systems or be cut.

DSOA's twist is **the car**. It's your armor, your loudest noise source, your mobile base, your escape and your weapon. Every system below should ask: *what does the vehicle change here?*

---

## 1. STAT SYSTEM

### 1.1 Primary attributes (7)

Range is **1–10**, with a human average of 5. A new character gets **35 points** (avg 5). Each attribute starts at a minimum of 2 and can be raised to 10. Attributes rise slowly through use: +1 per roughly 40 hours of relevant activity, capped at a +2 lifetime gain over the starting value. Traits and injuries can also change them. *(Inspired by: Fallout 1/2's point-buy attributes; Kenshi's train-by-doing; JA2's slow stat growth.)*

| Attr | Name | What it governs in play |
|---|---|---|
| **BRN** | Brawn | Melee damage, carry weight, pushing cars, breaking doors, resisting being grabbed/knocked down |
| **GRT** | Grit | Max HP, bleed resistance, disease and infection resistance, fatigue resistance, pain tolerance |
| **QCK** | Quickness | Move speed, reload speed, dodge, reaction/interrupt chance, steering response |
| **EYE** | Eye | Ranged accuracy, spotting range, scavenging finds, weak-spot crits, night vision |
| **WIT** | Wits | Skill learning speed, crafting/repair quality, medicine, electronics, tactics |
| **NRV** | Nerve | Stress resistance, panic threshold, suppression resistance, intimidation, leadership |
| **CHA** | Charm | Barter prices, recruitment, crew relationship growth, faction reputation gain, persuasion |

Why seven: fewer than 6 makes builds same-y, and more than 8 creates dump stats. Every attribute here has a combat use *and* a non-combat use, so none of them is a pure dump. (Fallout's fan complaint about CHA being a dump stat is the warning here.)

### 1.2 Derived stats (formulas + example numbers)

The example is "Average Joe" (all 5s) vs "Brute" (BRN 9, GRT 8, QCK 4, EYE 4, WIT 3, NRV 6, CHA 1).

| Derived | Formula | Joe | Brute |
|---|---|---|---|
| Max HP (torso pool) | `60 + GRT×8 + BRN×2` | 110 | 142 |
| Carry capacity (kg) | `15 + BRN×4` | 35 | 51 |
| Move speed (m/s, jog) | `4.0 + (QCK−5)×0.15` | 4.0 | 3.85 |
| Sprint stamina (s) | `8 + GRT×1.2 + QCK×0.6` | 17 | 20.0 |
| Reload multiplier | `1.25 − QCK×0.05` | 1.0 | 1.05 |
| Base hit chance mod | `(EYE−5)×4%` | 0% | −4% |
| Crit chance | `2% + EYE×0.6% + skill/10%` | 5% | 4.4% |
| Spot radius, day (m) | `30 + EYE×4` | 50 | 46 |
| Spot radius, night (m) | `day × (0.35 + EYE×0.03)` | 25 | 21.6 |
| Learn rate | `0.7 + WIT×0.06` | 1.0× | 0.88× |
| Stress cap | `60 + NRV×8` | 100 | 108 |
| Panic threshold (% of cap) | `70% + NRV×2%` | 80% | 82% |
| Suppression resistance | `NRV×5 + Combat skill×0.3` | 25 | 30+ |
| Barter spread | `price × (1.30 − CHA×0.03)` | 1.15× | 1.27× |
| Interrupt chance (when enemy appears in view) | `QCK×4% + NRV×2% + Awareness/5` | 30% | 28%+ |
| Infection resistance | `GRT×3%` (reduces chance per bite-exposure) | 15% | 24% |
| Melee damage mult | `0.7 + BRN×0.06` | 1.0× | 1.24× |
| Pain tolerance | `GRT×10` pain points before penalties | 50 | 80 |

**Interrupt** (from JA2). In a real-time game this works as a **reaction window**. When a hostile enters a crew member's view cone, roll the interrupt chance. On success, the game drops to 25% speed for 1.5 s (single-player only) *or* that crew member gets a free snap-shot at a +15% accuracy bonus (MP-safe version). This brings JA2's tension into real time without pausing.

### 1.3 Skills (34, in 6 groups)

Range is **0–100**. XP per use is scaled by learn rate. You gain experience mostly from succeeding at hard tasks, and a little from failing (25% XP). *(Inspired by: Project Zomboid's skill-from-use plus books that multiply XP; Kenshi's "getting beaten up trains toughness"; Fallout's tag skills.)*

**Tag skills:** each character picks 3 at creation. Tagged skills start +15 and learn at 1.5×. (Fallout.)

**Skill manuals** found while scavenging give 3× XP for the next X hours in their tier band (PZ's books).

| Group | Skills |
|---|---|
| **Firearms (6)** | Pistols · Long guns (rifles) · Scatterguns (shotguns) · Automatics (SMG/AR, burst control) · Heavy (LMG, launchers) · Mounted guns (vehicle turrets) |
| **Close (4)** | Blades · Blunt · Unarmed/Grapple · Thrown (molotovs, grenades, spears) |
| **Road (6)** | Driving (handling, drift, ramming) · Vehicle Gunnery (firing *from* a moving car) · Mechanics (repair, tune, swap parts) · Fabrication (welding armor, rams, spikes) · Navigation (off-road, fuel efficiency, shortcut finding) · Towing/Salvage (stripping wrecks) |
| **Survival (7)** | Scavenging · Foraging · Hunting/Trapping · Cooking · Farming · Fishing · Fieldcraft (tracking, camps, weather reading) |
| **Tech & Medical (6)** | First Aid (field) · Surgery (base) · Electrics (generators, wiring, alarms) · Electronics (radio, cameras, drones) · Chemistry (fuel, explosives, meds) · Carpentry/Masonry (building) |
| **Social & Command (5)** | Barter · Persuade · Intimidate · Leadership (crew morale aura, order speed) · Tactics (AI command quality, ambush setup) |

**Plus 2 hidden "body" skills** trained only by experience, as in Kenshi: **Toughness** (damage resistance up to 15%, trained by taking hits) and **Awareness** (detection, trained by spotting and being surprised). Total: 36.

**Skill tiers and what they unlock:** 0–19 Untrained (−20% speed, 15% fumble). 20–39 Novice. 40–59 Competent. 60–79 Expert. 80–100 Master. Each tier crossing (20/40/60/80) offers a **perk pick** from that skill's list.

### 1.4 Perks per skill tier (sample — 2 choices per tier, pick 1)

The structure is Fallout's perk cadence crossed with Battle Brothers' meaningful choice: two options per tier, and each is a *playstyle fork*, not a +5%.

| Skill | 20 | 40 | 60 | 80 |
|---|---|---|---|---|
| **Driving** | *Smooth Hands:* −30% passenger accuracy penalty while driving / *Lead Foot:* +8% top speed, +15% fuel use | *Bootlegger Turn:* 180° handbrake turn at 50% speed loss / *Ram Brace:* −40% self-damage on rams | *Two-Wheel:* drive through 1-car gaps at speed / *Bulldozer:* rams knock infected down in 4 m radius | *Getaway Driver:* crew in car gain +25% stress recovery after escapes / *Iron Chariot:* vehicle takes −20% damage while you drive |
| **Mechanics** | *Field Patch:* repair to 50% without tools / *Scrounger:* +1 part from every wreck | *Tune-up:* +5% all car stats until next damage / *Quiet Muffler:* −35% engine noise radius | *Hot Swap:* part swaps 2× faster / *Overclock:* nitrous-style 4 s burst, 90 s cooldown | *Miracle Worker:* revive a "totaled" car once per day / *Master Builder:* +1 armor slot on any chassis |
| **Long guns** | *Steady:* +10% acc after 1 s still / *Snap:* −40% aim time first shot | *Overwatch:* auto-fire at first enemy entering cone / *Headhunter:* +25% crit vs head | *Suppressor Discipline:* subsonic shots −50% noise / *Penetrator:* shots pass through 1 body or car door | *One Shot:* first shot from concealment ×2 dmg / *Spotter Link:* tagged enemies visible to all crew 10 s |
| **First Aid** | *Tourniquet:* stop bleed in 2 s / *Calm Voice:* patient −15 stress | *Splint:* fractures don't drop to crawl / *Triage:* see all crew HP/conditions at a glance | *Combat Medic:* heal while moving / *Field Surgeon:* limited surgery outside base (60% success cap) | *Second Chance:* revive downed crew within 30 s (once/fight) / *Infection Hunter:* 35% chance to halt early infection by amputation |
| **Leadership** | *Rally:* shout, crew −20 stress, 120 s CD / *Taskmaster:* jobs +10% speed, −2 morale/day | *Drill Sergeant:* trainees learn +25% / *Shepherd:* crew panic threshold +10% | *Inspiring:* aura 15 m, +5% acc & +10% stress resist / *Iron Rule:* crew never desert while morale > 15 | *Legend:* recruitment chance +30%, faction rep gains +20% / *War Chief:* unlocks 2 extra squad orders |

All 36 skills get this 4×2 grid, for **288 perks** total. Write them in data (`perks.json`), and generate the boring ones from templates (+X% speed) so designers hand-author only around 80.

### 1.5 Traits (36 — positive and negative, net-zero budget)

You pick at creation, and they're also randomly rolled on recruits. Positives cost points, and negatives give points. The budget nets to **0 ±2**. Some traits are **earned in play**, as in Battle Brothers and Kenshi: you only get them through events. *(Inspired by: Fallout traits with upside and downside; PZ's occupation and trait point-buy; Rimworld's personality traits; JA2's personality quirks; Battle Brothers' backgrounds.)*

**Positive (cost)**
| Trait | Cost | Effect in play |
|---|---|---|
| Night Owl | 3 | No night accuracy penalty, sleeps 2 h less, +10% night spot radius |
| Iron Gut | 2 | Can eat spoiled food at 20% sickness chance (vs 70%) |
| Fast Learner | 6 | +30% XP all skills |
| Gearhead | 4 | Mechanics tagged free, hears car faults (shows part condition without inspecting) |
| Quiet Step | 4 | −40% footstep noise, +20% stealth |
| Thick-Skinned | 5 | −10% all damage, −30% scratch chance through clothing |
| Lucky | 5 | 5% chance any lethal hit becomes "downed"; +10% rare loot |
| Born Leader | 5 | +1 Leadership tier effect, crew relationships grow +25% faster |
| Steady Hands | 3 | −50% weapon sway, +10% first aid and surgery success |
| Light Sleeper | 2 | Wakes instantly on alarm; −10% sleep quality |
| Pack Mule | 3 | +10 kg carry |
| Road-Born | 4 | +15 Driving, no motion sickness, +10% car handling |
| Resilient | 4 | Infection progresses 40% slower; colds last half as long |
| Scav Eye | 3 | +1 loot roll per container |
| Cool Head | 4 | Stress gain −25% |
| Marksman's Eye | 4 | +10 to all firearms skills at start |
| Hardy | 3 | Hunger/thirst drain −20% |
| Sprinter | 3 | +20% sprint stamina |

**Negative (refund)**
| Trait | Refund | Effect in play |
|---|---|---|
| Loudmouth | 3 | Random chatter +15 m noise; can't stealth-crouch for 2 s after combat |
| Coward | 4 | Panic threshold −20%; flees at <40% HP unless leader nearby |
| Hothead | 3 | 15% chance to break formation and charge when insulted/shot at |
| Klutz | 3 | 10% chance to drop items when fleeing; fumble +10% |
| Asthmatic | 4 | Sprint stamina −40%, smoke/dust causes coughing (noise) |
| Night Blind | 3 | Night spot radius −40% |
| Heavy Sleeper | 2 | Doesn't wake to alarms 50% of time |
| Glutton | 3 | Food use +40% |
| Addict (pick: booze/pills/smokes) | 4 | Needs fix every 24 h or −15 morale and shakes (−15% acc) |
| Bad Back | 3 | −10 kg carry, heavy lifting causes pain |
| Pacifist | 6 | Won't kill humans (will fight infected); +20 relationship with medics |
| Kleptomaniac | 2 | Steals from shared stash and traders; trader rep −5 if caught |
| Carsick | 3 | Passenger stress +2/min at speed >80 km/h |
| Phobic (pick: dark/crowds/heights/blood) | 3 | +50% stress gain in trigger condition |
| Slow Healer | 3 | Wound heal time +50% |
| Smoker | 1 | +10% stress recovery when smoking, −10% stamina, lighter flare visible at night |
| Grudge-Holder | 2 | Relationship drops ×2 speed, rises ×0.5 |
| Fragile | 5 | Fractures 2× more likely, −15% max HP |

**Earned traits (event-only, 8 examples):** *Bitten Survivor* (once beat an infection → +50% resist), *Road Warrior* (killed 100 from a car), *Shell-Shocked* (survived 3 overruns → loud noises cause stress), *Hollow* (lost 2 friends → stress cap −10, can't form new bonds), *Butcher* (killed 50 humans → others fear them, CHA-based tasks −20%), *Veteran* (survived 30 fights → +10% everything at <50% HP), *Wheelman* (survived 10 chases → +Driving), *Survivor's Guilt* (only survivor of a squad wipe).

### 1.6 Conditions (status effects, 24)

These show as **small coloured tags on the crew portrait**. Each has 1–4 severity levels, and each level states its exact penalty. Hovering explains *why* you have it and *how to fix it*. That's the part players praise most in Project Zomboid. *(Inspired by: PZ's leveled status icons; Rimworld's mood thoughts with visible causes; Kenshi's hunger states.)*

| Condition | Levels | Example level-3 effect | Cure |
|---|---|---|---|
| Hungry | 4 | −15% stamina, −5 morale/day | Eat |
| Thirsty | 4 | −20% stamina, blurred vision edge | Drink |
| Tired | 4 | −20% acc, 25% chance micro-sleep while driving | Sleep |
| Exhausted (stamina) | 3 | Can't sprint, melee −30% | Rest 30 s |
| Stressed | 4 | −15% acc, refuses risky orders 20% | Rest, booze, smokes, music, friend talk |
| Panicked | 3 | Ignores orders 40%, flees nearest threat | Leader rally, time away from threat |
| Bored | 3 | −2 morale/h at base | Varied jobs, books, games |
| Lonely | 2 | Stress +1/h | Assigned buddy, social time |
| Pain | 4 | −20% acc and −15% speed | Painkillers, bandage, rest |
| Bleeding | 4 | −2 HP/s at L3 | Bandage/tourniquet |
| Cold | 4 | −15% speed, frostbite risk at L4 | Warm clothes, fire, car heater |
| Hot | 3 | Thirst ×2 | Shade, water, remove layers |
| Wet | 3 | Feeds Cold ×2 | Dry by fire/car |
| Sick (cold/flu) | 3 | Coughing (noise 8 m), −10% stamina | Rest, meds |
| Food Poisoned | 3 | Vomiting, −30% stamina | Time, charcoal meds |
| Infected (the plague) | 5 | Fever, −30% all; L5 = turns in 6–36 h | Experimental cure only; amputation early |
| Drunk | 3 | −20% acc, −40% stress | Time |
| Withdrawal | 3 | −15% acc, shakes | Fix or 72 h |
| Concussed | 2 | Blurred screen edge, −25% WIT | 24–72 h rest |
| Encumbered | 3 | −25% speed, stamina drain ×2 | Drop weight |
| Hearing Loss (temporary) | 2 | Can't hear footsteps/horde warnings 60 s | Time |
| Grieving | 3 | −20 morale, −10% work speed, 3–10 days | Funeral, time, friend |
| Inspired | 2 | +15% work speed, +10% acc | Wears off 6–12 h |
| Well Fed / Rested | 2 | +10% stamina regen, +5 morale | Good meals/sleep |

### 1.7 Injuries by body part

**Model:** 7 hit zones, each with its own HP. Torso and head are the "core" pool that kills you. Limbs don't kill directly; they *disable*. *(Inspired by: Kenshi's per-limb HP with prosthetics; Fallout's aimed shots; Battle Brothers' permanent injuries; Dwarf-Fortress-lite.)*

| Zone | Share of max HP | Top-down hit weight (random) | Disabled at 0 → effect |
|---|---|---|---|
| Head | 15% | 8% (aimed: crit zone) | Knockout or death (if overkill >50%) |
| Torso | 40% | 40% | Down; bleeding out 60 s |
| Left arm | 10% | 12% | Can't use 2-hand guns, reload ×2 |
| Right arm | 10% | 12% | −40% accuracy, melee −50% |
| Left leg | 12.5% | 14% | Limp: speed −50%, can't sprint |
| Right leg | 12.5% | 14% | Same; both legs = crawl |

**Injury types** (rolled when a zone takes ≥25% of its HP in one hit):

| Injury | Typical cause | Effect | Heal time | Permanent chance |
|---|---|---|---|---|
| Scratch | Infected claw | Minor bleed L1; 7% infection | 1 day | 0% |
| Laceration | Blades, glass, crash | Bleed L2; 1% infection from infected | 3 days | 0% |
| Bite | Infected | Bleed L2; **45% infection** (GRT reduces) | 5 days | 5% (scar) |
| Gunshot | Firearms | Bleed L3; bullet lodged (needs extraction) | 7–14 days | 10% |
| Fracture | Falls, crashes, blunt | Zone disabled until splinted | 21–40 days | 15% (−1 QCK) |
| Burn | Molotov, car fire | Pain L3, infection (normal) risk | 10 days | 20% (scar −1 CHA) |
| Concussion | Head blunt, crash | Concussed condition | 3 days | 5% (−1 WIT) |
| Crush | Car crash, pinned | Fracture + internal bleed | 30 days | 25% |
| Dismemberment | Overkill on limb (>150% zone HP), amputation | Limb gone | — | 100% → prosthetic needed |

**Car crashes are the DSOA-specific injury source.** Crash damage to occupants is `impact_speed_kmh² / 180 × (1 − seatbelt 0.5) × (1 − cage armor)`. At 60 km/h unbelted: 20 dmg spread across torso/head/legs. At 120 km/h: 80 dmg, which is often lethal. Seatbelts take 0.6 s to unbuckle, so they slow your bail-out. That's a real trade-off.

**Prosthetics** (Kenshi): scrap peg leg (−30% speed), hook hand (melee bonus, no guns), and fabricated limbs from a workshop (−10% to +5% depending on quality). This turns a maiming into a story instead of a reload.

### 1.8 Morale and stress

These are two separate meters, because they fail differently.

**Stress (individual, short-term, 0 → stress cap ~100).** It comes from what's happening right now.
- Gains: shot at +3/near-miss, hit +8, ally downed +15, ally killed +25 (+40 if friends), infected within 3 m +1/s, overrun alarm +10, car crash +12, darkness alone +0.5/min.
- Loss: out of combat −1/min, sleeping −8/h, booze −20, smoke −10, rally −20, friend nearby −0.5/min extra.
- **Breaks** at the panic threshold (≈80%). Roll on a break table weighted by traits: 40% flee, 20% freeze (5 s), 15% berserk (charges, +30% melee, ignores cover), 10% cower (prone, won't fire), 10% scream (40 m noise), 5% heroic (Inspired condition). *(XCOM panic, Darkest Dungeon-style break table, JA2 morale.)*

**Morale (individual + community, long-term, −100 to +100).** It comes from how life is going. It's computed like Rimworld's mood: a **sum of named, visible modifiers**.
- Base +0. Example modifiers: good meal +5, ate raw −5, slept in bed +4, slept in car −3, slept on ground −6, power on +5, hot shower +6, friend died −20 (decays 10 days), saw horror −5, won fight +4, recruit joined +3, trader visit +3, "cramped" (beds < crew) −8, "starving community" −15, faction leader (them) +10.
- Community morale = average of crew morale, weighted so that the **bottom quartile counts double**. One miserable member drags the group, which matches SoD2's reported rule that negative morale weighs more than positive.
- Thresholds: **> +30** work speed +10% and occasional "Inspired". **0 to +30** normal. **−1 to −30** work −10% and occasional arguments. **−31 to −60** refuses jobs 15% of the time, may steal and leave (1%/day). **< −60** fights, desertion 5%/day, might sabotage.

### 1.9 Loyalty and trust

**Loyalty (to the leader/player, 0–100).** Separate from morale. A happy crew member can still betray a cruel leader.
- Starts at 30 (a recruit) or 50 (a rescued person).
- +2/day if needs are met, +5 per shared survived fight, +10 when you save them personally, +15 when you go back for them when downed, +3 when you honor promises (pay, cuts of loot).
- −5 when they're left behind, −10 for executing a prisoner (unless trait-aligned), −15 when you abandon a downed crew member, −20 for broken promises, −3/day for each unmet need.
- **Effects:** < 20 = leaves at the next safe moment, steals 1 item. 20–40 = follows orders with a 10% refusal rate on dangerous ones. 40–70 = normal. 70+ = accepts dangerous jobs, never deserts, defends you if a faction offers a bribe. 90+ = "Ride or Die": takes a bullet for you (10% intercept chance).
- **Pay/cut model** (JA2 contracts): optional per-crew "share" of loot. A crew member with the Mercenary background needs a 10% share or loses 2 loyalty/day.

### 1.10 Relationships between crew

There's a pairwise score from **−100 to +100** for every crew pair (15 pairs at 6 crew, which is cheap). *(JA2 likes/dislikes; Rimworld opinions; Battle Brothers; Mount & Blade companion conflicts.)*
- Seeded at recruitment: ±0 baseline, then trait compatibility (Pacifist vs Butcher −30, Hothead vs Hothead −15, both Gearhead +10), shared backstory (same hometown +20), plus a random ±15.
- Drift: working the same job +0.5/day, fighting together +2, saving the other +15, eating together +0.2/day, an argument event −8, stealing from the other −20, romance rolls at +60 if orientation-compatible.
- **Tiers:** Rival (< −40), Dislike, Neutral, Friend (> 40), Bonded (> 75, partner or sibling-in-arms).
- **Effects:** Friends within 10 m give +5% accuracy and −20% stress gain. Bonded pairs give +10% and −35%, but the survivor of a Bonded pair gets −40 morale and "Hollow" at a 30% chance if the other dies. Rivals in the same car or squad give +1 stress/10 min, and there's a 3%/day fight event (injury chance) if both have morale < 0. Rivals on the same job get −15% output.
- **Ultimatums:** at −80, one demands "them or me". This is the JA2 moment players remember forever.

### 1.11 Reputation axes

There are four global axes, plus per-faction standing. *(Fallout karma plus town rep; GTA2's three-gang respect, where raising one lowers the rival; Mount & Blade's faction relations; Wasteland 3 faction standing.)*

| Axis | Range | Raised by | Lowered by | Changes |
|---|---|---|---|---|
| **Mercy ↔ Ruthless** | −100..100 | Sparing, healing strangers, sharing food | Executions, robbing, leaving people | Recruit pool (merciful attracts medics; ruthless attracts raiders), some factions' doors |
| **Known (Fame)** | 0..100 | Big kills, saving towns, convoys | Time (−1/week) | Radio chatter about you, bounty hunters at 60+, trader stock quality |
| **Road Law ↔ Outlaw** | −100..100 | Honoring deals, escorting | Ramming civilians, stealing cars | Checkpoint access, militia aggression |
| **Fear** | 0..100 | Winning against odds, Intimidate | Fleeing, losing crew | Enemies more likely to surrender/flee at 50+ (−morale for them) |

**Per-faction standing (−100..100), linked GTA2-style.** Every faction has a rivalry matrix. Doing a job for Faction A gives +10 to A, −5 to A's rival, and +2 to A's ally. Each faction's tier sets its prices (±25%), safe passage, jobs, and whether they shoot on sight (< −50) or send raids (< −70).

---

## 2. CREW JOBS

Crew get assigned through a **job board**: one job each, with a backup job when the primary has no inputs. Work happens on a **work tick every 10 in-game minutes**. Output is `base × (0.5 + skill/100) × morale_mod × tool_mod × facility_mod`. With skill 50, morale 0, standard tools and a basic facility, that comes to 1.0× base. *(Rimworld job priorities; Kenshi job assignment and automation; SoD2 facility staffing; Barotrauma crew stations; Mount & Blade party roles.)*

### 2.1 At base / camp

| Job | Inputs | Output (per 8 h shift, at 1.0×) | Skill | Facility |
|---|---|---|---|---|
| **Guard (perimeter)** | Weapon, ammo | Detects threats at 1.5× spot radius; fires automatically; 0.5 ammo/shift idle | Firearms, Awareness | Watchtower (+20 m spot) |
| **Gate keeper** | — | Opens/closes gate for returning cars; vets strangers | NRV, Persuade | Gate |
| **Radio watch** | Power 2/h | 20% chance/shift to intercept a lead (trader, raid warning, survivor, cache); warns of raids 1–3 h early | Electronics | Radio room |
| **Cook** | 3 raw food | 4 cooked meals (+morale), 0 spoilage | Cooking | Kitchen |
| **Farmer** | Seeds, water 5 L | 1.5 food/day per plot after a 14–28 day grow | Farming | Garden plots (4 max early) |
| **Water hauler/purifier** | Fuel or power | 20 L clean water | Fieldcraft/Chemistry | Rain collector, purifier |
| **Mechanic** | Parts, tools | Repairs 25% car condition or installs 1 part | Mechanics | Garage (+50%) |
| **Fabricator** | Scrap 10, fuel 1 | 1 armor plate / ram / spike strip | Fabrication | Workshop + welder |
| **Gunsmith** | Scrap, gunpowder | 20 rounds or repairs a weapon 30% | Chemistry, Firearms | Workbench |
| **Medic (on duty)** | Meds | Heals 2 patients/shift +30% heal rate; treats infection | First Aid, Surgery | Infirmary |
| **Chemist** | Chemicals, alcohol | 2 meds or 5 L fuel (biodiesel/ethanol) or 2 explosives | Chemistry | Lab/still |
| **Builder** | Materials | Builds/repairs walls & facilities 50 HP/h | Carpentry | — |
| **Electrician** | Fuel/parts | Keeps generator running; solar install | Electrics | Generator |
| **Trainer / Drill** | Ammo (shooting), none (melee) | Trainee gets 1.5× XP in trainer's best skill (trainer must be 20+ higher) | Leadership + skill | Range/gym |
| **Teacher** | Books | Grants skill-manual effect to up to 3 crew | WIT | Library |
| **Quartermaster** | — | −15% resource consumption via rationing; auto-sorts loot | Barter, WIT | Storage |
| **Recreation / Morale** | Booze, instruments | +5 community morale/day | CHA | Common room |
| **Prisoner warden** | Food | Interrogate (leads), recruit (2%/day), or ransom | Intimidate/Persuade | Cells |
| **Rest** | Bed | Removes Tired, −8 stress/h | — | Beds |

### 2.2 Off-screen missions (crew leave the map, resolved by dice + time)

This is the State of Decay / Mount & Blade / XCOM-squad-send pattern. You pick a destination on the map, the crew (1–3) and the vehicle. **Duration** is `distance / vehicle_speed + task_time`. **Success** is `skill_sum_weighted + gear + vehicle − danger_of_region`, rolled per stage: travel → task → return.

| Mission | Typical time | Inputs | Output | Risks |
|---|---|---|---|---|
| **Scavenge run** | 4–12 h | Car, fuel 5–15 L | 6–20 resource units of a chosen type | 15% injury, 3% death, 10% vehicle damage in a "medium" zone |
| **Fuel siphon run** | 3–6 h | Hose, cans | 10–40 L | Noise draws infected |
| **Trade run (caravan)** | 8–24 h | Goods | Goods at faction prices | Ambush 10%, rep with faction |
| **Scout** | 2–6 h | Fast car or on foot | Reveals map tiles, horde positions, loot density | Low |
| **Hunt/forage** | 6 h | Weapon/traps | 3–8 food | Low–med |
| **Recruit search** | 12 h | Charm crew | 30% chance of new survivor lead | Med |
| **Rescue** (triggered) | Varies | Squad | Survivor, rep | High |
| **Outpost resupply** | 2–4 h | Car | Moves stock between bases | Low |
| **Supply convoy escort** (MP or faction) | 12 h | 2+ cars | Pay + rep | Medium–high |

**Results report.** Missions return with a short, generated *story card*: "Rosa found the pharmacy looted but traded a carton of smokes for antibiotics. Dee got scratched on the way out." Players want **stories, not just numbers**.

**Rule:** if the player is within 200 m of the mission location, the mission *becomes real*. It spawns on the map, live. Off-screen missions are only for out-of-sight work.

### 2.3 On the road (in-vehicle stations)

From Barotrauma and FTL: each seat is a station.

| Seat | Role | Skill | Effect |
|---|---|---|---|
| Driver | Steers (player or AI) | Driving | Handling, ram damage |
| Shotgun seat | Window gunner, 180° arc on right side | Vehicle Gunnery | Fires from car (−25% acc at speed > 60) |
| Rear gunners (L/R) | Side arcs | Vehicle Gunnery | — |
| Turret / roof hatch | 360° mounted weapon | Mounted guns | Exposed: 2× chance to be hit |
| Navigator | Map, route | Navigation | −10% fuel, spots shortcuts, 15% horde early-warning |
| Mechanic-on-board | Field repair while driving | Mechanics | Repairs 1%/s up to 60% condition; puts out engine fires |
| Medic-on-board | Treats wounded in car | First Aid | Heals in transit |
| Lookout (bed/roof) | Spotting | Awareness | +25 m detection, warns of mines/spikes |

---

## 3. BASE BUILDING

### 3.1 Claimable sites

*(SoD 1/2 claimable homes with fixed slot counts; PZ "make any house your base"; Kenshi build anywhere; 7DTD build anywhere; Fallout 4 settlements; Mad Max strongholds.)*

**DSOA rule: any building can be a camp, and only certain building types can be a base.** Claiming takes three steps: clear it (no hostiles inside a 30 m radius), secure the doors, and plant your flag. A crew member must stay or visit at least every 72 h, or it decays back to unclaimed.

| Site type | Where | Slots (S/M/L facility) | Beds | Starting defense | Notes |
|---|---|---|---|---|---|
| Camp (tent/car circle) | Anywhere | 0/1/0 | car seats + 2 | 0 | Pack up in 60 s; can't build walls |
| House | Suburbs | 2/1/0 | 4 | Doors, windows | Easy, weak |
| Gas station | Highways | 2/1/0 + fuel tank | 3 | Glass front (weak) | Fuel 200–800 L in ground tank, pump needs power |
| Auto shop / garage | City edge | 1/2/0 | 3 | Roll-up doors (strong) | Free Garage facility |
| Church | Town | 2/1/1 | 8 | Thick walls | +5 morale |
| Warehouse | Industrial | 2/2/1 | 8 | Few windows | Large storage, loud to work in |
| Police station | City | 2/2/0 | 6 | Armory, cells | Ammo cache, hostile-faction magnet |
| School / mall | City center | 3/2/2 | 12 | Many entrances (hard) | Great loot, high infected density |
| Farmstead | Rural | 2/1/2 (fields) | 6 | Fences | Food engine, far from loot |
| Truck stop | Interstate | 2/2/1 | 6 | Open lot | Traffic of traders and raiders |
| Prison / military depot | Rare, 1–2 per map | 3/3/2 | 20 | Walls, towers | Endgame base; heavy guarded |

**Outposts** (from SoD) are small claimed points that don't hold crew. Each gives a passive bonus: a radio tower (map reveal), a fuel depot (+5 L/day), a watch post (+horde warnings in a 500 m radius), or a farm field (+2 food/day). The cap is `1 + base_tier`, and each costs 1 Influence/day upkeep.

### 3.2 Facilities (examples, with tiers)

| Facility | Size | T1 → T3 effect | Power | Upkeep/day |
|---|---|---|---|---|
| Beds/Bunks | S | 2 → 6 beds | — | — |
| Kitchen | S | Cook +0% → +50%, morale meals | 0/1/2 | 1 fuel (stove) |
| Infirmary | M | Heal +30% → +100%, surgery, infection treatment | 1/2/3 | Meds |
| Garage | L | Repair +50% → +150%, lift (part swap), paint | 1/3/5 | — |
| Workshop | M | Fabrication → welder → machining | 2/4/6 | — |
| Storage | S | +100 → +400 capacity | — | — |
| Garden | M/L | 4 → 12 plots; greenhouse (winter) at T3 | 0/0/2 | Water |
| Water | S | Rain barrels (20 L/rain) → purifier → well pump | 0/1/2 | — |
| Generator | S | 10 → 25 power, 1–2 L fuel/h, **noise 40 m** | — | Fuel |
| Solar array | M | 6 → 18 power (day only), silent | — | — |
| Battery bank | S | Stores 60 → 240 power-hours | — | — |
| Watchtower | S | +20 m spot, guard +10% acc, sniper nest | — | — |
| Radio room | S | Leads, raid warnings, MP chat channels | 2 | — |
| Range/Gym | M | Training ×1.25 → ×1.75 | — | Ammo |
| Common room | M | +3 → +10 morale | 0/1/2 | Booze |
| Cells | S | 2 → 6 prisoners | — | Food |
| Fuel still | M | 3 → 10 L/day biofuel from crops/alcohol | 1 | Crops |
| Car wash / armor bay | L | Install car armor tiers | 3 | — |

**Power** is a single number: production vs draw, with a battery buffer. Running at a deficit turns off facilities in a priority order you set. A loud generator against a quiet solar setup is a **core noise trade-off**, because the generator feeds the horde heat map (§4).

### 3.3 Defenses

| Defense | HP | Cost | Notes |
|---|---|---|---|
| Barricaded window (planks) | 100 | 3 wood | Infected break in ~20 s each |
| Reinforced door | 400 | 10 metal | |
| Chain-link fence | 150/segment | 4 metal | See-through: infected attracted by sight |
| Sheet-metal wall | 500 | 8 metal | Blocks LOS |
| Concrete barrier / wrecked-car wall | 1500 | Tow a wreck | **DSOA unique:** push dead cars into walls with your vehicle |
| Spike strip / tire shredder | — | 6 metal | Pops raider tires |
| Punji pit / ditch | — | Labor 4 h | Slows infected 60%, kills 10% |
| Floodlights | — | Power 1 | Removes night penalty, but visible 300 m |
| Alarm (cans/electric) | — | — | Wakes base, +10 s warning |
| Auto-turret (salvaged) | 300 | Rare parts, ammo | Electronics 60+; loud |
| Fire barrel / burn moat | — | Fuel 5 L/night | Infected avoid 50%; light source |
| Murder hole / firing slit | — | — | +50% cover for guards |

### 3.4 Upkeep

Each crew member uses 1 food + 1 water/day. The base uses fuel for its power and Influence for its outposts. Facilities lose 1–2% condition/day and get repaired by Builders. **Daily upkeep on a 6-crew mid base:** 6 food, 6 water, 8–15 L fuel, 3 Influence. A scavenge run brings in ~10 units, so about **one run per day keeps the lights on**. That's the right "pressure without grind" balance. SoD players praise this loop and complain when it tips into a chore. If the player is overstocked, consumption rises (spoilage 2%/day without a fridge).

### 3.5 Raids and sieges

| Trigger | Attacker | Warning | Size |
|---|---|---|---|
| Base noise heat > threshold | Infected horde | Radio/watch: 0–20 min | §4 formula |
| Faction standing < −70 | Faction raid | Radio 1–3 h (if watched) | `3 + base_wealth/200 + fame/20` raiders, 1–3 vehicles |
| Wealth envy (stockpile value high) | Raider gang | 30 min | Same formula, ×1.3 |
| Siege night (every 7–10 days, §4) | Big horde | Calendar-known | Scaled |
| Player (MP) | Other players | See §6 | — |

**Rimworld's lesson:** raid size should scale with **wealth + crew strength**, not with time alone, and smoothly, so getting rich is risky but never instant doom. Rimworld's "raid points" approach: `points = wealth × 0.003 + crew_combat_power × 0.5`, clamped so the next raid is ≤ 1.4× the last one.

**What attackers do:** infected go to the loudest or brightest point and attack the weakest barrier. Raiders use doctrines (§5.7): siege with fire, sapper breach, a vehicle ram on the gate, or snipers on overwatch.

---

## 4. HORDES & OVERRUN

### 4.1 What great games do

- **Project Zomboid.** Spawn density comes from a map heat layer (building types × radius × multiplier, with seeded noise subtracting) *(reported, Build 42)*. Sound events pull zombies (shotgun reportedly ~200 tiles, carpentry ~15–20 tiles) *(reported)*. A meta layer moves zombies between cells with no pathfinding cost. Helicopter events drag hordes across the map. Respawn refills cleared cells over time.
- **State of Decay 2.** Plague hearts claim the buildings around them. Killing one makes the remaining hearts stronger. Infestations spawn and grow in buildings near your base, and leaving them alone lowers morale and brings sieges.
- **7 Days to Die.** A predictable **blood moon** every 7 days. Size scales with a game stage of roughly `(level + days alive) × difficulty` *(reported)*. In multiplayer the count is per player and additive. The appeal is **anticipation**: a week spent preparing for one night.
- **Days Gone / World War Z**: visible hordes of 300–500 that flow like liquid. You don't fight them, you funnel them.
- **Dying Light**: the night-time danger shift. The same map becomes a different game.
- **Rimworld**: infestations spawn out of the hillside under your base, so they come from inside the base.

### 4.2 DSOA horde model (proposal)

Use **three layers**, each on a different clock:

**Layer A — Heat map (per 32 m cell, updated every 2 s).**
`heat[c] += noise_event_dB_equiv × falloff(distance)`, decaying at `heat ×= 0.97 per tick` (half-life ~45 s).

| Source | Heat radius (m) | Heat added |
|---|---|---|
| Footsteps (jog) | 8 | 1 |
| Melee kill | 10 | 2 |
| Suppressed pistol | 25 | 5 |
| Pistol | 120 | 20 |
| Rifle | 200 | 30 |
| Shotgun | 180 | 35 |
| LMG burst | 250 | 50 |
| Explosion | 400 | 100 |
| Car engine idle | 30 | 3/s |
| Car at speed | 60 | 5/s |
| Car horn | 200 | 40 |
| Car alarm (world prop) | 250 | 10/s for 60 s |
| Crash | 150 | 40 |
| Generator | 40 | 2/s (constant) |
| Floodlight (night only, light heat) | 300 (LOS) | 1/s |
| Building/hammering | 20 | 1/s |

**Layer B — Migration (strategic, every 60 s, on a 256 m region grid).**
Each region has an infected **population** (abstract count; only the nearest ~150 are real agents). Each region computes `pull = Σ heat in region (last 10 min) + 0.2 × food_smell (bases, corpses)`. Population flows to its neighbors: `flow = pop × 0.04 × (pull_neighbor − pull_self)/max_pull`, capped at 15% per tick. Hordes form when a region exceeds **300 infected**. A horde becomes a **single migrating entity** that moves 1–2 km/h along roads (infected follow roads and lines of least resistance) and renders as a dense flock when within 300 m.

**Layer C — Overrun state (per city district, daily).**
Every district has an **Infestation level 0–5**:

| Level | Name | Infected density | Effects |
|---|---|---|---|
| 0 | Clear | < 5 / ha | Traders, NPC survivors live here |
| 1 | Stirring | 5–20 | Occasional packs |
| 2 | Infested | 20–60 | Nests appear in 2–4 buildings |
| 3 | Swarmed | 60–150 | Street hordes, NPC survivors flee |
| 4 | Overrun | 150–400 | Districts go dark (no power/lights), faction pulls out |
| 5 | Dead Zone | 400+ | A **Hive** (our plague heart equivalent) exists; spreads |

**Spread rule:** each day a district at level ≥ 3 gives +1 level to each neighbor with probability `0.15 × (level − 2)`. Neighbors with an active defended base or faction garrison roll at half chance. **Recovery:** a level drops 1 for every 2 days with ≥ 60% of its nests and hive destroyed, or when a faction pushes in.

**Nests and Hives** (the plague heart pattern, mechanics only):
- **Nest:** a building that spawns 1 infected per 10 min (cap 30 around it) and raises district infestation +0.1/day. It has 800 HP and is destroyed with explosives, fire, or 2 minutes of melee while it spawns defenders.
- **Hive:** one per level-5 district. It has 4000 HP and spawns a horde of 80 when its HP drops below 75/50/25%. It has a "claimed radius" of 300 m, and bases inside it can't be used until it's destroyed. **Each Hive destroyed makes the remaining Hives +10% HP and +1 nest/day** (SoD2's escalation lesson): the endgame accelerates.
- An optional **seed event** creates a new hive in a level-4 district every 5–8 days unless a base or faction holds it.

**Siege nights (the anticipation clock).** Every **7 days ± 1** (shown on the HUD from day 5), there's a siege night. Horde size is:
`size = 20 + 6 × day_index_week + 0.4 × base_wealth/100 + 8 × crew_count`, × difficulty (0.7 / 1.0 / 1.4).
- Week 1, 2 crew, poor: 20 + 6 + 2 + 16 = **44**.
- Week 4, 5 crew, wealth 3000: 20 + 24 + 12 + 40 = **96**.
- In MP: per player, additive, but `0.75 ×` for each additional player within 300 m (soft cap on co-op stacking).
Waves come every 90–150 s, **3–6 waves**, from 2–3 compass directions picked by heat (attackers come from the noisiest sides). Specials join from week 2 on: 10% runners, 5% brutes (door-breakers, 4× HP), 2% screamers (raise heat +40 on sight, pulling more).

**The car-vs-horde rule (DSOA identity):** ramming kills or knocks down infected, but each impact costs `2 + speed/20` car HP, and **body build-up** happens. Over 6 bodies under or around the car (they're grabbing it), speed drops 15% each, and at 10 the car stalls. That's what makes driving into a horde a decision instead of a cheat code. Plowing through 30 is possible with a ram and armor, but costs ~40% of a mid car's HP.

**Night:** infected spot radius ×0.6 but hearing ×1.5. Runners spawn at 2× the rate. Lights draw them.

### 4.3 Tuning targets

- A loud gunfight in an L2 district should pull **15–40** infected within 3 minutes.
- Leaving a generator running 24/7 in a city should raise neighborhood infestation by **+1 level within ~5 days**.
- With no player intervention, a 10-district city should go from 2 overrun districts at start to **5–6 overrun by day 30**. Players can see a city "die" and choose to save it or leave.
- Days 1–3 should be survivable with good play and no base.

---

## 5. TACTICAL AI THAT USES THE ENVIRONMENT

Architecture: **Utility AI** for action choice, **influence maps** for spatial reasoning, **a squad-level coordinator** (blackboard) for team tactics, and **faction doctrines** as weight presets. This is cheap enough for a three.js game when the influence grid is 2 m, the update runs at 4–5 Hz, and only agents within 120 m of a player run full thinking. *(Inspired by: F.E.A.R.-style squad coordination; XCOM cover/flank; JA2 tactical AI; Killzone's cover-point scoring; The Division / Ghost Recon bounding.)*

### 5.1 Cover points

Pre-bake **cover nodes** when a city chunk generates. Sample every 1.5 m along walls, cars, dumpsters, barriers and low walls. Each node stores:
- `normal` (direction the cover faces), `height` (low 0.9 m = crouch/vault, high 1.8 m = full)
- `material` (wood 0.3, car body 0.5, engine block 0.9, brick 0.8, concrete 1.0 bullet stop)
- `destructible HP`, `peek_left/right` (is there a lean edge?)

**Dynamic cover:** every vehicle registers 6 nodes (front engine block = best, doors = medium, rear trunk = weak, gas tank side = *danger*: 10% ignite on a heavy hit). Cars that move or explode remove their nodes.

### 5.2 Cover scoring formula

For agent *a* choosing cover node *n* against known threats *T*:

```
score(n) =
    w_prot  * Σ_t∈T  protection(n, t) / |T|          // 0..1
  + w_fire  * Σ_t∈T  canShoot(n, t) * weaponBand(dist(n,t))  / |T|
  − w_dist  * pathDist(a, n) / 30m
  − w_expo  * exposedPathFraction(a → n)              // % of path in enemy LOS
  − w_flank * flankedness(n)                          // threats outside cover arc
  + w_squad * spacing(n, allies)                      // penalize < 4 m from ally (grenade)
  + w_high  * heightAdvantage(n)                      // rooftops, +0.5 per storey
  − w_crowd * occupied(n)
  + w_role  * roleBonus(n)                            // e.g., sniper wants range
```

`protection(n,t) = clamp(dot(n.normal, dir(t→n)),0,1) × material × (height==high ? 1 : 0.6)`
`flankedness(n) = fraction of threats where dot(n.normal, dir(t→n)) < 0.3`

**Default weights** (rifleman): `prot 1.0, fire 0.8, dist 0.4, expo 0.6, flank 1.2, squad 0.3, high 0.4, crowd 2.0, role 0.5`.
Evaluate the top 24 nodes within 25 m, and re-evaluate when threats change or every 1.5 s. Use **hysteresis**: only switch if the new score is > current + 0.15. Without it, agents keep dancing between covers.

### 5.3 Distance bands per weapon

| Weapon | Ideal | Effective | Max | AI behavior |
|---|---|---|---|---|
| Melee | 0–2 m | 2 m | — | Close via cover-to-cover, charge last 8 m |
| Pistol | 5–15 | 25 | 45 | Fight from close cover, retreat if > 25 |
| SMG | 5–18 | 30 | 50 | Aggressive advance, flankers |
| Shotgun | 2–10 | 15 | 30 | Wait at doors/corners, ambush, rush |
| Assault rifle | 15–40 | 60 | 120 | Main line, suppress |
| Hunting rifle | 40–100 | 150 | 250 | Hold high ground, relocate after 3 shots |
| LMG | 20–60 | 80 | 150 | Suppression base, don't move |
| Molotov/grenade | 8–25 | 25 | 30 | Throw at clumps ≥ 2 or at cover held > 6 s |
| Vehicle-mounted | 10–50 | 70 | 120 | Circle-strafe 15–30 m from target |

`weaponBand(d) = 1.0 inside ideal, linear falloff to 0.3 at effective, 0 at max`.

### 5.4 Influence maps (2 m grid around the fight, 64×64)

Maintain these layers:
- **Threat:** Σ over enemies of `dps × LOS(cell, enemy) × band(dist)`. Agents avoid high-threat cells when moving.
- **Control:** friendly minus enemy presence (gaussian, σ = 8 m). Shows the "front line".
- **Visibility:** how many enemies see each cell (used for exposed-path checks).
- **Noise/heat** (from §4): raiders avoid fighting in loud cells at night if infected are near (smart raiders retreat when the horde arrives).
- **Danger memory:** cells where allies died decay over 60 s. Agents avoid repeating the same death.

Paths use A* with cost `1 + 4×threat + 2×visibility`. Flankers use `1 + 8×visibility` so they pick concealed routes.

### 5.5 Squad tactics (coordinator runs at 1 Hz)

The squad blackboard holds: known threats, the shared target, the front line (control = 0 contour), and member roles.

**Flanking / pincer.**
1. Pick the threat with the best cover score against our front. Call that the **anchor threat**.
2. Compute its cover normal *N*. A flank position is any cover node where `dot(N, dir(threat→node)) < −0.2` (behind the cover) or < 0.3 (side), within 15–35 m.
3. Assign 1–2 members whose role is Flanker or Assault and whose path exposure is < 0.4.
4. The remaining members are given **Suppress** on the anchor until the flankers arrive or 12 s pass.
5. **Pincer:** with ≥ 4 members, send 2 flank groups to opposite sides (angle between them ≥ 90°).

**Suppression.**
- Each round passing within 1.5 m of an agent adds `suppression += weapon_supp (pistol 4, rifle 6, LMG 10)`, and it decays 12/s.
- At ≥ 40: −30% accuracy, prefers to stay in cover. At ≥ 70: pinned, won't peek for 2 s, crawls only. Players get the same (screen shake/vignette). NRV-derived resistance subtracts.
- Suppressors fire at the target's **cover edge** with 3× ammo use and 20% hit chance. That's the trade.

**Bounding overwatch.**
- Split the squad into teams A and B. A holds (overwatch: auto-fire at any enemy entering the cone) while B moves 10–20 m to the next cover with score > 0.5. Then they swap.
- The move is allowed only when `threat(path) < 0.5` or overwatch is active on all visible threats.
- Typical bound: 3–5 s of movement, 2–4 s of settling.

**Retreat / regroup.**
Squad morale `M = avg(member stress inverted) − 15 × casualties_last_30s + 10 × leader_alive`. Retreat triggers at M < 30, **or** when outnumbered 2:1 in the control map, **or** when a horde comes within 80 m. On retreat: pick a **rally point** 40–80 m away on the low-threat side, ideally near a vehicle. The rear member gets a **cover-the-retreat** role (suppress). Once at the rally point, they re-form and either fight with renewed stress or leave in vehicles.

**Surrender.** An individual with stress > 90, no allies within 20 m, and the player's Fear ≥ 30 has a 25% chance to drop their weapon. That gives you a prisoner choice, and the Mercy axis.

### 5.6 Using the environment

- **Vehicles as cover:** prefer the engine-block side (material 0.9). Never take cover at the fuel-tank side when an enemy has explosives or molotovs. AI should **drive a car into position as mobile cover** (park sideways, 1.5 s exit) when no cover is within 10 m.
- **Rooftops and high ground:** each storey of height gives +10% hit chance and lets agents see over low cover (low cover = 0 protection against shots from ≥ 2 storeys above within 25 m). Snipers and LMGs path to stairs/ladders when `heightAdvantage − timeToReach×0.05 > 0.3`.
- **Doors and windows:** doors are chokepoints. Shotgunners ambush 2–3 m inside, to the side of the door frame. Windows give the shooter 70% protection but they're a known location: after 2 shots from the same window, the AI relocates (score penalty +0.3/shot). Breaching: stack 2+ at the door, throw a grenade/molotov if available, enter with a 0.6 s stagger.
- **Destructibles:** shoot cars to make them explode (2.5 m kill, 6 m fire) when ≥ 2 enemies are within 4 m of one. Shoot out lights at night when the attacking side has night vision or flashlights.
- **Horde as a weapon:** smart factions (doctrine flag) **lure hordes** into enemy bases. They fire a horn or flare from 150 m and drive away. Players love this, and the AI can do it too.
- **Smoke:** blocks LOS. AI uses it to cross wide streets (> 15 m exposed) when threat > 0.6.

### 5.7 Faction doctrines (weight presets + behaviors)

| Doctrine | Faction flavor | Weights / behavior |
|---|---|---|
| **Road Pack** | Raider car gangs | Fight from vehicles, circle at 15–30 m, ram, spike strips; retreat = drive off; flank 0.6, vehicle cover 1.5 |
| **Garrison** | Militia/townsfolk | Defend fixed points; high `prot 1.4`, low `dist`; fight from windows/roofs; never pursue > 50 m |
| **Hunter-Killer** | Ex-military remnant | Bounding overwatch, pincers, suppression doctrine, grenades; flank 1.5, expo 1.0; retreat orderly |
| **Swarm** | Fanatic cult | Low self-preservation (`prot 0.3`), mass rush, berserk at high stress, molotovs; uses horde lures |
| **Ghosts** | Scavenger scouts | Avoid fights unless 2:1; snipe and relocate; steal cars; flee at first casualty |
| **Infected (not a doctrine, a flock)** | — | Boids: cohesion 0.6, alignment 0.4, separation 1.0, target-seek 1.2 toward heat; climb over each other at walls (stack 3 high = vault); doors/windows priority by sound |

### 5.8 Utility AI action list (per agent)

| Action | Key considerations (curves 0..1, multiplied) |
|---|---|
| Shoot | hasLOS × weaponBand × ammo>0 × (1−suppression) |
| Move to cover | threat at current spot × bestCoverScore improvement |
| Reload | ammo<30% × (inCover ? 1 : 0.3) |
| Flank | squad assigned × path concealment × aggression trait |
| Suppress | squad assigned × ammo>50% × target in cover |
| Throw explosive | enemies clustered ≥2 × target in cover > 6s × have item |
| Heal self/ally | HP<40% × inCover × have meds |
| Retreat | squad morale low × HP low × outnumbered |
| Enter/exit vehicle | threat distance × vehicle nearby × doctrine |
| Surrender | stress>90 × isolated × player Fear |
| Investigate noise | heat at location × not in combat |
| Loot body | no threats 20s × greed trait |

Multiply the considerations (with compensation factor `1 − (1 − score)×(1/n)` per Dave Mark's method so many factors don't crush the score), add a **momentum bonus of +0.1** to the current action, and pick the highest.

**Player-crew AI** uses the same system with a **player-set stance** (Hold / Follow / Aggressive / Stealth / Defend vehicle) that shifts the weights. Players hate crew that run into the open, so crew `prot` weight is never below 0.8. Players also hate crew who don't shoot, so Shoot's LOS check uses the *crew member's own* LOS, not the player's.

---

## 6. MULTIPLAYER SURVIVAL LESSONS

*(DayZ, Unturned, Rust, PZ servers, 7DTD servers, Conan, Valheim, SoD2 co-op, Last Oasis, Once Human.)*

**What players love**
1. **Emergent stories with strangers.** The DayZ "friendly?" moment. Tension comes from not knowing who's a threat. Add **proximity voice/text** and a radio channel system (the radio facility hosts local "frequencies").
2. **Co-op base-building with a friend** (Valheim, 7DTD). This is the biggest retention driver in the genre's co-op.
3. **Server identity.** Persistent towns that a community rebuilds. A shard should remember *who* saved a city.

**What kills servers**
1. **Offline raiding.** In Rust-style worlds, logging in to find a wiped base drives players away. **DSOA rule:** a base is **raidable only while its owners are online, or within 30 minutes of the last owner logging off**. While offline, the base has *NPC crew defense* (your crew are still there and fighting by AI). Infected sieges are still on, but at 50% size.
2. **Spawn-killing and griefing new players.** Give every new character a **72-hour (play-time) "green plate"**: they can't be damaged by players older than 72 h, and lose it early if they shoot a player. Fresh spawns go to safe-zone towns.
3. **Vehicle theft and destruction.** Cars are hours of work. Use **keys** (only crew can drive, and stealing needs Mechanics 40+ and 30 s of hotwiring, loud), plus **insurance/salvage**: a destroyed car leaves a chassis you can tow home and rebuild at 40% of its cost.
4. **Zerg clans.** Cap a crew at 6 humans + AI and a faction at 4 crews. Scale siege hordes per player (§4) so a big group pulls big hordes.
5. **Hacks and duping.** Run an authoritative server for combat, inventory and vehicle physics, and keep only cosmetics client-side. For three.js/web: do server-side hit validation (rewind ≤ 200 ms).
6. **Wipes.** Players hate losing everything, and they also need fresh starts. Use **season shards** (60–90 days) with **legacy carry-over**: 1 character's traits, a garage blueprint, and cosmetics. Have permanent "Long Road" shards for players who never want wipes.

**Shared crews**
- Each player owns their own crew (1–5 AI). Players can **lend** a crew member to another player's job board. Loyalty to the original leader stays, and the borrower's actions affect it.
- When co-op players fight together, AI crew from both sides use the same squad coordinator, and the squad leader is the senior player.
- **Death:** your player character is a crew member. If they die, you **take control of another crew member** (SoD's permadeath with succession, and a fan favorite). If the whole crew dies: a new solo survivor, and the old base becomes an unclaimed "ghost base" others can loot, with a journal.

**Persistence budget:** a shard keeps world state at **district level** (infestation, factions, claimed bases), at **building level** for claimed/looted state, and at **object level** only inside bases. Loot respawns per district every 3–7 real days, scaled inversely by infestation level (overrun districts get *more* loot, which is a reason to go in).

**PvE/PvP options per shard:** PvE (no PvP), PvP-Zones (cities at infestation ≥ 4 are PvP), Full PvP. Data across survival games keeps showing that most players pick **PvE or zoned PvP**. Ship PvE first.

---

## 7. "PLAYERS ALWAYS WANTED" — TOP 50 (ranked by impact for DSOA)

1. **Real AI survivors/companions with personalities**: PZ's most requested feature for a decade. Crew who act on their own, not just follow.
2. **Crew that work the base when you're away**, so they don't need micromanaging (PZ wishlists, Kenshi praise).
3. **Permadeath with succession**: when you die, play as another crew member (SoD's signature).
4. **Car as a home**: sleep, store, cook and fight from your vehicle. A mobile base.
5. **A world that changes without you**: cities fall, factions move, hordes migrate.
6. **Per-limb injuries and prosthetics**: lose a leg, get a peg, keep playing (Kenshi).
7. **Visible, explained status effects**: see *why* someone is sad or hurt and how to fix it.
8. **Relationships, rivalries and romances among crew** that cause real events (JA2, Rimworld).
9. **Anticipated siege nights**: a known date to prepare for (7DTD).
10. **Hordes you can see moving across the map** and lure, funnel or dodge (Days Gone, PZ helicopter).
11. **Build anywhere and claim any building** (PZ, 7DTD), not just preset spots.
12. **Deep car customization**: armor plates, rams, mounted guns, engine swaps (Mad Max, Autoduel).
13. **Firing from a moving car with crew gunners** (Autoduel, Mad Max, Twisted Metal).
14. **Off-screen missions with story reports** (SoD, Mount & Blade, XCOM base).
15. **Smart enemy humans** who flank, suppress and retreat (F.E.A.R., XCOM, JA2).
16. **Co-op with a friend sharing the base** (Valheim, 7DTD, SoD2).
17. **No offline raiding**: protect what I built while I sleep.
18. **Crew who learn by doing and teach each other** (Kenshi, PZ).
19. **Traits with real downsides that make a story** (Fallout traits, Rimworld).
20. **Recruit anyone you meet**, including enemies who surrender (M&B, Kenshi).
21. **Factions that remember** you and react, with rival-linked rep (GTA2, Fallout NV).
22. **Infection you can survive at a cost**: amputation, an experimental cure, earned resistance.
23. **Noise matters**: guns and engines bring the horde (PZ).
24. **A night that changes the game**: different threats, lights as a double-edged sword (Dying Light).
25. **Squad orders that are simple but meaningful**: hold, follow, flank, cover (Brothers in Arms).
26. **Interrupt/reaction moments**: the "I saw him first" shot (JA2).
27. **Random road events and choices** (Death Road to Canada, FTL, Oregon Trail).
28. **Power, water and food as a satisfying production chain** (Rimworld, Fallout 4).
29. **Push wrecks to build walls**: use the city itself as material.
30. **Trade caravans and dynamic economy**: prices shaped by scarcity.
31. **Hunger and thirst that matter early and become manageable later**, not a chore forever.
32. **Weather and seasons**: winter forces a different strategy (PZ, Kenshi, The Long Dark).
33. **Prisoners**: interrogate, recruit, ransom, release (Kenshi, Rimworld).
34. **Morale breaks with flavor**: berserk, flee, freeze (Darkest Dungeon, XCOM).
35. **Destructible cover and buildings**: shoot through doors, burn the barricade.
36. **Stealth that works**: vision cones and sound radii you can see (Commandos, Desperados).
37. **Vehicle wrecks that can be rebuilt**, not lost forever.
38. **Lots of character backgrounds/occupations** with starting kits (PZ, Battle Brothers).
39. **Legacy between runs/seasons**: something carries over.
40. **Readable tactical UI**: hit chance, cover quality and threat lines visible on hover (XCOM).
41. **Training facilities that actually speed progression** (Kenshi dojo, SoD training).
42. **Pets/animals**: a dog that warns of infected and boosts morale (Fallout dog, Kenshi animals).
43. **Funerals and graves**: mourning as a mechanic (Rimworld, SoD).
44. **Radio voices and broadcasts**: leads, lore, other survivors (Fallout, Days Gone).
45. **Scavenging with real variety per building type** (PZ loot tables, Fallout).
46. **Fuel scarcity as strategy**: siphon, distill, route planning (Mad Max, Death Road).
47. **Base raids by humans with real tactics**, not just infected (Rimworld, SoD2 enemies).
48. **Safe zones/towns as social hubs** with a trader, a bar and job boards (Fallout towns, DayZ traders).
49. **Mod support / data-driven content**: JSON items, traits, perks (Rimworld, PZ, Kenshi live on mods).
50. **A real ending or goal state** (a cure, or reclaiming a state) for players who want closure. Sandbox players should still be able to ignore it.

---

## 8. Implementation priorities (what to build first)

1. **Data model:** attributes → derived → skills → traits → conditions as JSON plus a pure `stats.js` function set (headless-testable).
2. **Heat map + migration** (§4.2 A/B): this is the system everything else talks to.
3. **Crew job board + work tick** with 6 jobs (guard, cook, mechanic, medic, scavenge-offscreen, rest).
4. **Cover nodes + scoring + distance bands**: one doctrine (Garrison) first.
5. **Per-limb injuries + car-crash damage.**
6. **Morale/stress with visible named modifiers.**
7. **Siege night** on a 7-day clock.
8. Relationships, loyalty, factions, MP rules: after the solo loop is fun.

---

## Sources

- [State of Decay 2 — Wikipedia](https://en.wikipedia.org/wiki/State_of_Decay_2) (plague territory date, hearts)
- [Shacknews — How to improve morale in State of Decay 2](https://www.shacknews.com/article/104977/how-to-improve-morale-in-state-of-decay-2)
- [PureXbox — SoD2 update brings plague territory](https://www.purexbox.com/news/2021/06/state_of_decay_2s_latest_free_update_brings_a_plague_to_the_game)
- [Windows Central — SoD2 beginner's guide](https://amp.windowscentral.com/state-decay-2-beginners-guide-spoiler-free-survival-tips)
- [Tom's Guide — SoD2 tips](https://www.tomsguide.com/us/state-of-decay-2-tips,review-5437.html)
- [PCGamesN — Project Zomboid spawn heat map update](https://www.pcgamesn.com/project-zomboid/spawn-update)
- [pzfans — What attracts zombies to bases (B42)](https://pzfans.com/what-attracts-zombies-to-bases/) (noise radii, fan source)
- [Steam — PZ migration discussion](https://steamcommunity.com/app/108600/discussions/0/3364775232089608856)
- [GamingOnLinux — PZ 2022 roadmap, NPCs most requested](https://gamingonlinux.com/2022/01/project-zomboid-has-big-plans-for-2022-and-beyond-with-npcs-on-the-way)
- [Steam — PZ dev "top 5 wishes" thread](https://steamcommunity.com/app/108600/discussions/0/530647080133173615)
- [Alternate Atlas — PZ review](https://alternateatlas.bearblog.dev/review-project-zomboid-a-game-i-love-and-can-no-longer-love/)
- [7 Days to Die wiki — Gamestage](https://7daystodie.wiki.gg/wiki/Gamestage)
- [7 Days to Die wiki — Blood Moon Horde](https://7daystodie.wiki.gg/wiki/Blood_Moon_Horde)
- [Steam — 7DTD per-player horde count discussion](https://steamcommunity.com/app/251570/discussions/0/2967271684649603373)
- [Jagged Alliance Wiki — JA2](https://jaggedalliance.fandom.com/wiki/Jagged_Alliance_2)
- [fadden.com — JA2 details](https://fadden.com/gaming/ja2/)
- [Turn Based Lovers — JA2 review](https://turnbasedlovers.com/review/jagged-alliance-2-cult-classic-review/)
- [Ragtag Crew (itch.io)](https://angelika-werner.itch.io/ragtag-crew) (crew-personality design reference)
- [Dread Central — Ashwalkers](https://www.dreadcentral.com/news/481739/release-date-announced-for-post-apocalyptic-survival-game-ashwalkers-2/)
- Design knowledge (not fetched this session): Rimworld storyteller and raid points, Kenshi limbs and jobs, Fallout 1/2 traits and perks, XCOM cover and flanking, utility AI (Dave Mark, *Behavioral Mathematics for Game AI*), F.E.A.R. squad AI (Jeff Orkin GDC 2006), Killzone cover-point scoring.
