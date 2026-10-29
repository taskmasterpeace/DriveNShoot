# WEB_SURVIVAL — the body, shelter and the car's upkeep (web engine)

**Status:** water and food SHIPPED 2026-10-22; rest, sleep, microsleeps and BITE FEVER SHIPPED 2026-10-22 late. **The
body deepened** SHIPPED 2026-10-23 on `feat/web-survival2`: climate (heat, cold, wet clothes), wounds that want the
right treatment (bleeding, sprains, breaks, burns, bites) and wound infection, food poisoning, mood (fear, gloom,
boredom), shelter as survival (your hold, a house, a car, the open ground, danger rolls), car upkeep (oil, the desert's
heat on the radiator, wear on tyres, brakes and the engine, garages), and the TELLTALES row on the HUD.
Code: `web/src/data/survival.js` (every row), `web/src/systems/survival.js` (the body), `web/src/systems/upkeep.js`
(the car), `web/src/ui/telltales.js` (the HUD row and the tunnel). Hooks (each one line): `main.js` (foot speed x
`speedMul`, the mend x `healMul`), `systems/inventory.js` (`survival.useItem` before an item's own effect),
`systems/vehicledamage.js` (`upkeep.tick` on the modifiers it hands the driving model), `systems/vehicles.js` (braking
x `fxm.brake`). Agent commands `needs`, `wound`, `shelter`, `upkeep`, `sleep`, `fever`; selftest "climate: …",
"wounds: …", "mood: …", "shelter: …", "car upkeep: …", "telltales: …", plus "survival: …", "rest: …", "fever: …".

## 1. Overview

The player's body runs on needs that drain on the game clock (a game hour is 30 real seconds; T runs it x40):
**water**, **food** and **rest**, and now **warmth** (two-sided: cold and heat), **wet**, three **moods** (fear,
gloom, boredom), **wounds** and two sicknesses (wound infection, food poisoning) beside the bite fever. Each wears in
pips (0–4), and each pip costs something through the same few **single consumers**: stamina recovery and the stamina
cap, foot speed, the sway on your aim, how fast you mend, how much of the view stays clear (the tunnel), the dark at the
edges, health. One **CONDITION** reading folds it all into 0–100 and a word.

The structure is borrowed from Robert's own needs layer in his superhero game (LSW `data/psyche.js`, `medical.js`):
it is a **multiplier layer, not a second game** (every state reaches play only through the consumers above); an
**event is appraised, not looked up** (mood events push three DRIVES, safety, company and purpose, and a thwarted drive
raises its mood); and there is **one condition reading** ("expose one Condition bar"). The survival-sim genre gave the
mechanics: cold and heat, wet clothes, wounds that want the right treatment, infection, panic, gloom and boredom, status
icons at the edge of the screen. The numbers and the words are ours.

**Shelter is survival.** You live out of your car, out of a house, or not for long. Where you sleep decides how a
night rests you, how much of the night's cold it keeps out, and what finds you while you sleep. A full night in a bed
under a roof makes that house **your hold**; it rests you best when its doors bar from inside and water is stored in
it. **The car needs upkeep too:** oil that burns, an engine that runs hot under the desert noon, tyres, brakes and an
engine that wear, and garages that put it right.

## 2. Player fantasy

You have been awake since yesterday morning. Your hands won't hold the sights still, the edges of the world are going
dark, and twice on the drive back the road simply wasn't there for a second. The temperature gauge has sat in the red
since noon because the oil is down to a smear; the brakes go to the floor before they bite. There is a mattress in the
back room of the house you've made yours on the edge of town, three jugs of water in the kitchen cupboard, and a door
that bars. You lie down with the rifle beside you. Out on the flats last week you slept in the seat of the car, cold to
the bone by four in the morning, and woke to something scratching at the glass. Tonight you sleep. The cut on your arm
is dressed and clean; the fever from the bite is going. Tomorrow you'll take the car to Kenji's yard and leave it there
a day.

## 3. Detailed rules

### 3.1 Needs (`NEEDS`)
Water 40 game hours from full to empty at rest (x2 sprinting, x1.25 in the day's heat, x the heat pips' `waterMul`, x
food poisoning's); food 80 (x1.3 sprinting, x1.3 with bite fever or food poisoning); rest 20 awake (x1.35 sprinting).
Pips at 0.35, 0.18, 0.06 and 0. Words: THIRSTY / PARCHED / DEHYDRATED / DYING OF THIRST; PECKISH / HUNGRY / WEAK WITH
HUNGER / STARVING; TIRED / WEARY / EXHAUSTED / DEAD ON YOUR FEET. A pip that worsens while awake toasts its word.

### 3.2 Effects and the single consumers (`EFFECTS`, `BODY_EFFECTS`, `MOOD_EFFECTS`, wound rows)
Every state's pip row folds into `g.needs`: **staminaRegen** and **maxStamina** multiply (the cap takes the lowest);
**sway** multiplies the player's spread (combat.js); **speedMul** multiplies the one foot-speed line (main.js);
**healMul** multiplies the out-of-combat mend (main.js) and every wound's own clock; **sight** (the lowest) is how much
of the view stays clear: `ui/telltales.js` darkens the rest in a ring around you; **vignette** darkens the edges
(hud.js); **hpPerMin** sums (health lost a real minute; the worst source names the cause); **waterMul**, **foodMul**
and **gloomMul** scale drains. Nothing else in the game reads the body.

### 3.3 Microsleeps
Dead on your feet, every 35–80 s your eyes close for 1.4 s: the screen goes black, the keys do nothing, and a car you
are driving loses gas and steering (it coasts on in a straight line).

### 3.4 Sleeping
**N** sleeps wherever you can: a **bed** (every mattress in a building, within 1.8 m; E there too), a **bedroll** you
carry (also from the PACK screen), or the **seat of a parked car** (under 0.4 m/s; held on the handbrake). The bare
ground is agent-only in v1. Allowed below REST 0.85, with nobody hostile and none of the infected within 18 m. Asleep:
time runs x40; REST refills `1/7 x quality x shelter x comfort` a game hour (quality: bed 1, bedroll 0.8, car seat 0.65,
ground 0.5; shelter §3.10; comfort §3.6); water and food drain at half their waking rate. You wake **rested** (REST ≥
0.995, or 11 game hours), **woken** (hurt; a hostile or one of the infected within 12 m; a noise within 40 m) or
**getting up** (E). A **full night** is one you wake from rested after at least 3 game hours.

### 3.5 The town sleeps too (`TOWN_NIGHT`, systems/ai.js)
From 22:00 to 06:00 the town's own people claim a bed within 25 m of home (else a floor spot), lie down and sleep till
dawn. A noise wakes them only within 45% of its reach; pain, a fight, or someone at the bedside for 1.5 s wakes them
(a `trespass` deed); woken, they stay up 45 s. Asleep they **witness nothing** and a **trader keeps no counter**.
Whoever has not reached a bed `giveUp` (25 s) after bedtime lies down where they stand, so the town is down 25 s after
22:00 (or after `setTime`); the selftest judges it from then (docs/design/WEB_BATTERY_STABILITY.md §3.3).

### 3.6 Climate: heat, cold and wet clothes (`CLIMATE`, `WARMTH`, `WET`)
The **air** follows a desert day: 6 °C just before dawn (05:00) to 41 °C mid-afternoon (15:00), shifted by the
weather (rain −7, an acid storm −9, a dust storm +2, fog −4, ashfall −6, overcast −3). What you **feel** is the air
pulled toward a shelter's own temperature by its `pull` (§3.10), +6 °C sprinting, −11 °C at full soak, and asleep what
you lie under (bed +5, bedroll +7, car seat +2). A moving closed car runs its heater (pull 0.75). **Warmth** (0 frozen,
0.5 comfortable, 1 cooked) drifts toward `0.5 + (felt − 20)/40`, half the gap closing in about 1.4 game hours.
- **Cold** pips at warmth ≤ 0.35 / 0.25 / 0.15 / 0.06: CHILLY / COLD / FREEZING / HYPOTHERMIC. Costs: pip 2 sway x1.1,
  speed x0.95, mend x0.85; pip 3 sway x1.25, speed x0.85, stamina regen x0.8, mend x0.6, −1 hp/min; pip 4 sway x1.45,
  speed x0.7, regen x0.6, cap 0.7, mend x0.3, −4 hp/min, sight 0.8.
- **Heat** pips at ≥ 0.65 / 0.75 / 0.85 / 0.94: WARM / HOT / OVERHEATING / HEATSTROKE. Costs: water drains x1.15 / x1.35
  / x1.6 / x2; pip 2 regen x0.85; pip 3 regen x0.7, cap 0.8, dark edges, sight 0.85; pip 4 regen x0.5, cap 0.6, −4
  hp/min, sight 0.7.
- **Wet:** rain in the open (not under a roof, not in a closed car) soaks you at 1.6 a game hour x the rain's weight;
  wading soaks you to 0.7, swimming to 1. You dry at 0.45 a game hour (x1.5 when the air is over 30 °C, x2 under a
  roof). Pips at 0.15 / 0.4 / 0.7 / 0.95: DAMP / WET / SOAKED / DRENCHED; soaked costs speed x0.97, drenched x0.95 and
  regen x0.9, and wet clothes are what turns a cold night into a freezing one.
- **A night's comfort:** each cold pip rests you at 1 / 0.9 / 0.8 / 0.6 / 0.45 of the place's quality, each heat pip at
  1 / 0.95 / 0.85 / 0.7 / 0.55.

### 3.7 Wounds (`INJURIES`, `WOUND_FROM`, `TREATMENTS`)
A wound comes from a hit that lands on you, by its cause: a **bullet** (60% at 6+ damage) or **glass** (90%) cuts a
**laceration**; a **bite** leaves a **bite**; a door's **bash** sprains (30%); a **car** breaks a bone (50% at 20+) or
sprains (60%); a **blast** burns (70%) or breaks (25% at 30+); a **fall** (a hit with nobody behind it: off a train at
speed, out of a moving car) sprains (50% at 8+) or breaks (20% at 25+); **fire** burns (the char on your clothes is the
tell). At most six at once (the oldest gives way).

| Wound | Open, it costs | Treated, it costs | Wants | Mends |
|---|---|---|---|---|
| Laceration (GASHED) | bleeds 6 hp/min, sway x1.05, dirt 0.05/h (x1.5 while open) | nothing | bandage, disinfect | 30 h (half speed while it bleeds) |
| Bite (BITTEN) | sway x1.05 (its dirt is the bite fever) | nothing | bandage | 40 h |
| Sprain | speed x0.85, regen x0.9 | speed x0.95 | splint | 24 h set, x0.5 unset |
| Broken bone | speed x0.6, cap 0.6, sway x1.15 | speed x0.82, cap 0.85, sway x1.05 | splint | 140 h set, x0.2 unset |
| Burn (BURNED) | −1 hp/min, regen x0.85, mend x0.85, dirt 0.08/h | regen x0.95 | bandage, disinfect | 50 h |

**Treatments** (by item, `TREATMENTS`): a **rag** stops the blood but adds 0.25 dirt; a **bandage** dresses; a **suture
kit** dresses, cleans and mends x1.6; a **first-aid kit** dresses, cleans, splints and mends x1.3; a **splint** sets a
sprain or a break; **disinfectant** cleans; **burn salve** dresses and cleans a burn and mends it x1.8; **painkillers**
take fear down 3; honey, peaches and a ration lift the gloom. A splint, disinfectant or salve with nothing to work on is
refused and not used up. New items (`MED_ITEMS`: splint, disinfectant, burn salve, motor oil) join the item table at
boot and turn up in bathrooms, armories, garages and fuel stops (`MED_LOOT`).

**Wound infection** (`INFECTION`): a wound's dirt reaching 1 turns into WOUND INFECTION: mend x0.5, regen x0.85, sway
x1.05, darker edges, and after 24 game hours −1.5 hp/min. Only **antibiotics** clear it (the same pills treat a bite
fever). A disinfected wound never infects. **Food poisoning** (`SICKNESS`): something rotten eaten (the "IT WAS OFF"
hurt) runs 10 game hours: regen x0.75, water drains x1.5, food x1.3, sway x1.05; it passes.

### 3.8 Bite fever (`FEVER`)
A bite from the infected that lands starts it (or starts its clock again). 36 game hours: stamina regen x0.75, food
drains x1.3, sway x1.1, the edges darken. Antibiotics treat it; a full night's sleep after the treatment breaks it.
Untreated it passes at 36 h. It never takes health by itself, and the player never turns (THE_INFECTED.md §3.6).

### 3.9 Mood: fear, gloom and boredom (`MOODS`, `APPRAISALS`, `MOOD_EFFECTS`)
Three drives, each feeding one mood (0–10): **safety → fear**, **company → gloom**, **purpose → boredom**. An event or
a standing pressure pushes a drive; a thwarted push raises the mood, a served one lowers it.
- **Fear** (real seconds): a hit that lands (−1.6 safety x its size, up to x2), each of the infected within 14 m (−0.6 a
  second, up to three), each hostile within 30 m (−0.45 a second, up to three), night in the open on foot (−0.04 a
  second); a roof or a closed car with nothing after you serves it (+0.25 a second), a kill serves it (+0.6). It fades
  0.12 a second when nothing raises it. Pips at 2 / 4 / 6.5 / 8.5: UNEASY / AFRAID / PANICKED / TERRIFIED. Costs: pip 2
  sway x1.15, sight 0.9; pip 3 sway x1.35, sight 0.75, speed x1.05 (adrenaline); pip 4 sway x1.6, sight 0.6, speed x1.08.
- **Gloom** (game hours): alone, −0.22 company an hour; someone riding with you +0.6; a conversation or a trade +2.2;
  a companion killed −4. Boredom multiplies what raises it. Fades 0.12 an hour. Pips at 2.5 / 4.5 / 6.5 / 8.5: LOW /
  GLOOMY / DEPRESSED / HOPELESS. Costs: pip 2 mend x0.85; pip 3 mend x0.7, speed x0.93, regen x0.9; pip 4 mend x0.55,
  speed x0.85, regen x0.8, darker edges.
- **Boredom** (game hours): standing about −1.1 purpose an hour; on the move, at the wheel or in a fight +0.9; a shelf
  or crate searched +0.6; a conversation +0.4; a kill +1.2. Fades 0.3 an hour (x3 asleep). Pips at 2.5 / 4.5 / 6.5 /
  8.5: RESTLESS / BORED / STIR-CRAZY / NUMB. Costs: gloom builds x1.5 / x2.2 / x3, the view greys (sight 0.95, 0.9).
- A full night in your own hold: +3 safety, +1.5 company, +0.5 purpose.

### 3.10 Shelter (`SHELTER`, `HOLD`, `PROWL`)
| Where | Rest x | Keeps out (pull toward) | Danger a game hour asleep |
|---|---|---|---|
| **Your hold** | 1.05, +0.05 doors that bar, +0.05 water stored | 0.8 → 22 °C | 0.02; 0 with doors that bar |
| **A house** (any roof) | 1 | 0.7 → 22 °C | 0.06 |
| **A closed car** | 1 (the seat itself is 0.65: cramped) | 0.3 → 20 °C parked; 0.75 on the move | 0.05 |
| **The open** (ground, an open car, a bike) | 0.85 | 0 | 0.18 |

- **Claiming a hold:** wake from a full night in a bed under a roof that isn't already yours and it is ("THIS PLACE IS
  YOURS NOW · YOUR HOLD"). One hold at a time; `shelter clear=true` gives it up.
- **Its doors bar** (island houses with door leaves): lying down in your hold locks every one of its unlocked doors from
  inside; getting up unlocks them. A Phoenix ring house has no door leaves yet: no bar.
- **Stored water:** six drinks or more (`uses`) in boxes inside it.
- **Danger rolls:** asleep, `risk += danger x hours x U(0.5, 1.5)`; when it reaches 1, something comes for you
  (`PROWL`): at night one of the infected, by day a raider, 24 m off and walking in. The sleeper's own watch (12 m) wakes
  you. A night out in the open is likely to bring one; a barred hold never does.

### 3.11 The telltales (`ui/telltales.js`)
Renders: `docs/renders/web/survival/hud-telltales.jpg` (soaked, bleeding, a break, parched, weary, cold, afraid),
`sleep-in-car.jpg` (asleep in a parked car at 02:38: chilly, cramped), `garage-kenjis-yard.jpg` (a worn car at Kenji's
yard: oil, tyres, brakes, engine, fuel, the yard's green lamp).

A row of stamped-steel dash lamps across the top of the screen, hung under the brass compass ribbon and the subtitle
line (so neither is covered), worst first, one per state that is wrong right now:
water, food, rest; cold, heat, wet; each kind of wound (BLEEDING, BROKEN · SPLINT IT, SPRAINED · STRAP IT, … · DRESS
IT, … · CLEAN IT, … · MENDING); INFECTED, FEVER, SICK; fear, gloom, boredom; and, at the wheel, the car's own lamps (OIL
LOW / OIL DRY, RUNNING HOT / BOILING, TYRES WORN, BRAKES WORN, ENGINE WORN, FUEL LOW / NO FUEL). Each lamp is a stencil
icon lit in its severity (bone, amber, rust, blood; blood pulses), four notches for how bad, and the word under it on a
painted tape. Good news shows in green: YOUR HOLD, CAR · CRAMPED, and a garage bay at the wheel. The **CONDITION** plate
heads the row whenever anything is wrong (green ≥ 85, amber ≥ 65, rust ≥ 45, blood below). The **tunnel**: when
`sight` drops, the world goes dark around you in a ring that closes as it falls. No purple anywhere; the HUD's own
tokens (`ui/hud.css`). The status plate's dials and ailment tags (hud.js) stay as they were.

### 3.12 Car upkeep (`CAR_UPKEEP`, `GARAGE_BAYS`; systems/upkeep.js)
Fuel, the radiator, engine heat and part damage were vehicledamage.js's already. Added, every car, every frame it is
simulated:
- **Oil** (0..1, new cars 0.7–1 by their id): burns 0.015 a game hour with the engine running (+0.05 x engine wear).
  Under 0.25 the engine cools worse and wears x3 (OIL LOW); at 0 it loses power (x0.55) and eats itself (the engine part
  −0.02 a second under throttle). **Motor oil** (a quart, +0.4) pours into the car you sit in or stand beside.
- **The desert's heat:** `k = (air − 18)/22` (0 on a cool night, ~1.05 at the 41 °C afternoon); under throttle the
  engine takes `0.024 x k` more heat a second, and never cools below `0.3 x k` (heat soak). A dust storm adds a little.
- **Wear** (0 new .. 1 gone): tyres 0.004 a km (x3 sliding on the handbrake); brakes 0.0012 a second braking at 20 m/s;
  the engine 0.004 a game hour running (x4 boiling, x3 on low oil). Past its line it costs, through the modifiers
  vehicledamage.effects already hands the driving model: tyres past 0.4 take grip (to x0.6 at 1), brakes past 0.3
  take braking (to x0.35), the engine past 0.5 takes power (to x0.65) and top speed (to x0.85).
- **Garages:** a car parked inside one (no driver, under 0.3 m/s) is out of the weather and put right every game hour:
  wear −0.06, oil +0.2, engine/radiator/tank/lights/tyres +0.08, dents −0.1, hull +8% of its max. Garages are rows:
  KENJI'S YARD (his workshop in Rust Haven and 8 m of ground round its walls, found from where he works) and every
  WORKSHOP of the Phoenix ring (its vehicle bay). At the wheel in a garage, its lamp shows green.
- **Weathering:** a car parked in the open gains 0.0015 wear a game hour on every part.
- The driving model is untouched: wear and oil act only through `fxm.power`, `fxm.grip`, `fxm.top` and the one new
  `fxm.brake` on the braking line.

### 3.13 The HUD and saves
The status plate keeps its FOOD, WATER and REST dials; the telltales row (§3.11) carries everything else. **Saves**
keep water, food, rest, the fever, warmth, wet, the moods, the wounds (each with its clock, dressing, cleaning, splint
and dirt), an infection, food poisoning, the hold, and every car's oil, wear and km. A save from before loads
comfortable, dry, calm and whole with no hold. A load never resumes a sleep.

### 3.14 Profiles (`PROFILES`)
`full` is the game. `battery` (the engine selftest's) runs water, food, rest and the fever as ever and holds the
climate, wounds, mood, shelter and car upkeep still (their values stay where they are, so their effects stay neutral)
unless a check drives them. `needs profile=` switches.

## 4. Formulas

| Name | Formula | Variables and ranges | Example |
|---|---|---|---|
| Drain (awake) | `need −= drainPerHour · sprint? · heat? · feverFood? · waterMul/foodMul · h` | h = dt · timeScale · (fast ? 40 : 1) | rest, 4 h awake walking: 4/20 = −0.2 |
| Rest (asleep) | `rest += h · quality · shelterRest · comfort / 7` | quality 0.5–1, shelterRest 0.85–1.15, comfort 0.45–1 | hold, bed: 1·1.15/7 = 0.164/h; open ground: 0.5·0.85/7 = 0.061/h |
| Air | `low + (high−low)·k`, k = ½−½cos(π·t/10) for t = (h−5) mod 24 ≤ 10, else ½+½cos(π(t−10)/14); + weather | 6–41 °C | 15:00 → 41; 03:00 → 7.7 |
| Felt | `air + (to − air)·pull + 6·sprinting − 11·wet + asleepWarm` | pull 0–0.8 | house at 03:00: 7.7 + (22 − 7.7)·0.7 = 17.7 |
| Warmth | `w += (clamp(0.5 + (felt − 20)/40) − w)·(1 − e^(−0.5h))` | 0–1 | open ground at 03:00 aims for 0.19 (COLD); noon sun 1.5 h from 0.5: 0.76 (HOT) |
| Wet | `+1.6·rain·h` exposed; `−0.45·h·(air>30 ? 1.5 : 1)·(roof ? 2 : 1)` | 0–1 | soaked 0.8 at noon in the open: dry in ~1.2 h |
| Pips | count of lines crossed | 0–4 | warmth 0.1 → FREEZING (3) |
| Sway | `Π sway` of every state | 1–~3 | exhausted (1.35) + panicked (1.35): 1.82 |
| speedMul | `Π speedMul` | ~0.25–1.08 | broken unset 0.6 x freezing 0.85 = 0.51 |
| healMul | `Π healMul` | ~0.05–1 | gloomy 0.85 x infection 0.5 = 0.43 |
| sight | `min sight` | 0.6–1 | panicked 0.75: the clear ring shrinks to 35% |
| Bleeding | `−6 hp` a real minute per open laceration | — | two open cuts: −12/min |
| Dirt | `+dirt·h·(open ? 1.5 : 1)` until disinfected; 1 → infection | dirt 0.05–0.08 | a bandaged, unclean cut infects in 20 h; open, 13.3 h |
| Mend | `left −= h·healMul·heal·(unset ? slow : bleeding ? 0.5 : 1)` | heal x1–1.8 | a set break: 140 h; unset: 700 h |
| Fear | `+0.6/s` per infected within 14 m (≤3), `+0.45/s` per hostile within 30 m (≤3); `−0.12/s` (`−0.37/s` under a roof) | 0–10 | three infected close: PANICKED in ~3.6 s |
| Gloom / boredom | per game hour: alone +0.22·gloomMul, idle +1.1, busy −0.9; fade −0.12 / −0.3 | 0–10 | 6 idle hours: boredom 4.8 (BORED) |
| Danger | `risk += danger·h·U(0.5,1.5)`; ≥1 → a prowler | — | 8 h in the open: mean 1.44 (one visitor, likely) |
| Engine heat | `T* = (0.02 + 0.024k + 0.09·leak)/(cool − 0.015·lowOil)` | cool 0.05 healthy | noon: 0.90 (RUNNING HOT); night: 0.40; noon on low oil: 1.29 (BOILING) |
| Wear cost | `1 − cost·max(0, (w − from)/(1 − from))` | — | brakes at 1: x0.35 (an 18 m/s stop: 3.7 m → 10 m) |
| Garage | per game hour: wear −0.06, oil +0.2, parts +0.08, dents −0.1 | — | engine wear 0.8 → 0.54 in 4.3 h |
| CONDITION | `100 − Σ pip^1.5·3·weight − 5/wound − 4/open − 12/sickness − 30·(1 − hp/max)` | 0–100 | parched + freezing + panicked + a bleeding cut at full health: ~48 (HURTING) |

## 5. Edge cases

- **Hurt while asleep:** woken at once, not a full night. **Danger already close:** you cannot lie down.
- **A gunshot far away:** heard only within its own reach and at most 40 m. **Dying asleep:** no toast; respawn as ever.
- **Microsleep at the wheel:** gas and steering go to zero for 1.4 s; the car coasts. No crash is forced.
- **Bitten again while treated:** the treatment is undone (a new wound).
- **Antibiotics with nothing to treat:** they still heal 4; the line says nothing. With both a fever and an infection,
  one dose treats the fever and clears the infection.
- **A splint, disinfectant, salve or motor oil with nothing to work on:** refused ("nothing on you needs setting",
  "no wound that needs it", "the oil is already full", "no vehicle close enough") and not used up. A bandage or a rag
  with no wound works as before (hp, bleeding).
- **Hits the body does to itself** (thirst, hunger, bleeding, cold, heat, infection, a burn's sting, drowning, fire's
  tick) neither wound nor frighten you. Rotten food's hurt starts food poisoning instead.
- **God mode:** no hits land, so no wounds and no fright from hits; needs, climate and moods still run.
- **Talking:** the world holds still in a dialogue, so a conversation's lift lands when it ends.
- **Two homes:** claiming a second hold gives up the first.
- **A hold with a locked door you didn't bar:** left locked when you get up (only what sleep barred is unbarred).
- **A ring house as a hold:** no door leaves out there yet: no bar, danger 0.02.
- **Open cars, bikes, boats:** shelter is the open (no pull, rough danger); sleeping in them is not allowed anyway (the
  seat is for closed cars).
- **Teleports:** a car moved more than 5 m in a frame is not a drive (no tyre wear).
- **Old saves:** no `rest` → 0.9; no `fever` → none; no body fields → comfortable, dry, calm, whole, no hold; cars
  without upkeep fields get fresh oil and no wear.

## 6. Dependencies

- `systems/combat.js` reads `g.needs.sway`; `damage` on the player calls `survival.hurt()` and emits the `hurt` event the
  body reads (cause, amount, attacker) for wounds and fright. No new hook.
- `systems/zombies.js` calls `survival.bitten()` on a landed bite; it also spawns the night's prowlers (`spawn`).
- `systems/inventory.js`: one line asks `survival.useItem(id)` before an item's own effect (TREATMENTS); antibiotics'
  `cure` calls `survival.antibiotics()`; the bedroll's `sleep` act calls `survival.sleepAt('bedroll')`. Item rows and
  loot in `data/items.js` (the new ones are added from `MED_ITEMS`/`MED_LOOT` at boot).
- `main.js`: foot speed x `needs.speedMul`, the out-of-combat mend x `needs.healMul` (one line each); input while
  asleep or in a microsleep; beds; `noise` → `survival.heard`; stamina from `staminaRegen`/`maxStamina`;
  `insideBuilding` and `lastWet` read for shelter and soaking; `spawnRaider` for a day prowler.
- `systems/vehicledamage.js`: `effects()` hands its modifiers to `upkeep.tick` (one line); `systems/vehicles.js`:
  braking x `fxm.brake` (one line).
- `systems/interiors.js`: a hold's doors are barred and unbarred through `setLocked`.
- `world/streamer.js`: `ringBuildingAt` finds a WORKSHOP's bay.
- `ui/hud.js`: the dials, ailments, the sleep screen, the blackout, the tired edges (unchanged); `ui/telltales.js`
  mounts in its `.hud` root.
- `systems/chronicle.js`/`deeds.js`: events (`kill`, `dialogueOpen`, `trade`, `containerOpened`) feed the appraisal.
- `agent/api.js`: `needs`, `wound`, `shelter`, `upkeep`, `sleep`, `fever`; snapshot/restore via `survival.save/load`.
- THE_INFECTED.md §3.6 (the fever never turns you); WEB_FAN_SERVICE_BIBLE (the survival-sim genre row); LSW
  `data/psyche.js`, `medical.js` (the structure: appraisal, multiplier layer, one condition reading).

## 7. Tuning knobs

| Knob | Where | Value | Safe range | Affects |
|---|---|---|---|---|
| rest.drainPerHour | NEEDS | 1/20 | 1/30–1/14 | how often you must sleep |
| SLEEP.perHour / quality | SLEEP | 1/7; bed 1, bedroll 0.8, car 0.65, ground 0.5 | 1/10–1/5; 0.3–1.2 | how long a night takes, why a bed is worth finding |
| SLEEP.wakeR / wakeNoise / fullNight | SLEEP | 12 m / 40 m / 3 h | 6–20 / 20–80 / 2–6 | how jumpy sleep is; the fever cure |
| TOWN_NIGHT.* | TOWN_NIGHT | 22–6, 25 m, 1.5 s / 45 s / 0.45 | — | the town's night |
| FEVER.hours / staminaRegen / foodDrain | FEVER | 36 / 0.75 / 1.3 | canon knobs | the fever's shadow |
| CLIMATE.low / high | CLIMATE | 6 / 41 °C | 0–15 / 30–48 | how hard the desert day and night are |
| CLIMATE.comfort / span / rate | CLIMATE | 20 °C / 40 / 0.5 | 16–24 / 25–60 / 0.2–1 | where comfortable sits; how fast the body follows the air |
| CLIMATE.wetChill / sprintHeat | CLIMATE | 11 / 6 °C | 5–15 / 2–10 | wet clothes; running hot |
| WET.rain / dry | WET | 1.6 / 0.45 a game hour | 0.5–3 / 0.2–1 | how fast rain soaks and you dry |
| BODY_EFFECTS.cold / hot | BODY_EFFECTS | rows above | — | what cold and heat cost |
| INJURIES.*.bleeds / heal / dirt | INJURIES | 6 hp/min; 24–140 h; 0.05–0.08 | 2–12; —; 0.02–0.15 | how urgent a wound is |
| WOUND_FROM | WOUND_FROM | chances above | 0–1 | how often hits wound |
| INFECTION.hurtsAfter / hpPerMin | INFECTION | 24 h / −1.5 | 12–48 / −0.5 to −4 | how long you have to find antibiotics |
| APPRAISALS.* | APPRAISALS | above | x0.5–x2 | how fast moods move |
| MOODS.*.fade / lines | MOODS | 0.12 s / 0.12 h / 0.3 h | — | how fast moods settle |
| SHELTER.*.rest / pull / danger | SHELTER | table §3.10 | rest 0.7–1.3; danger 0–0.4 | why a hold beats a car beats the open |
| HOLD.door / water | HOLD | +0.05 rest, danger 0; +0.05 at 6 drinks | — | what makes a house a hold |
| SLEEP_COMFORT | SLEEP_COMFORT | 1 → 0.45 cold, 1 → 0.55 heat | — | what a cold night costs |
| PROWL.r / jitter | PROWL | 24 m / 0.5–1.5 | 15–40 | how close the danger spawns |
| CAR_UPKEEP.oil.burn / low | CAR_UPKEEP | 0.015 a game hour / 0.25 | 0.005–0.05 / 0.1–0.4 | how often you buy oil |
| CAR_UPKEEP.ambient.load / soak | CAR_UPKEEP | 0.024 / 0.3 | 0.01–0.04 / 0–0.5 | how hot the noon desert runs an engine |
| CAR_UPKEEP.wear.* | CAR_UPKEEP | tyres 0.004/km, brakes 0.0012/s, engine 0.004/h | x0.25–x4 | how fast a car wears out |
| GARAGE_BAYS.per | GARAGE_BAYS | wear 0.06, oil 0.2, parts 0.08, dents 0.1 a game hour | — | how fast a garage puts a car right |
| GARAGE_BAYS.places[].yard | GARAGE_BAYS | 8 m | 4–15 | how close to the workshop's walls a car must park |
| CONDITION.* | CONDITION | pip 3, weights, 5 / 4 / 12 | — | the one reading |

## 8. Acceptance criteria (selftest)

1. **Rest:** REST 0.05 → pip 3, sway ≥ 1.35, regen ≤ 0.6; REST 0 with a microsleep due → blackout, a held key moves under
   5 cm, over 1.6 s later. A bed from REST 0.3 wakes rested after 4.9 ± 0.6 game hours, a full night. On the bare
   ground, one of the infected 20 m off walks up and wakes the player.
2. **Fever:** a landed bite starts 36 ± 0.5 game hours; regen exactly 0.75 with every need full; food falls by
   `hours · 1.3/80` (± 6%); antibiotics then a full night break it; an untreated one passes and takes no health.
3. **The town sleeps:** at 23:00 Ike goes to bed and most of the town with him; his shelf has no counter; a witness
   pass misses him; a 30 m noise wakes him.
4. **A parked car:** N refuses rolling; parked, the player sleeps in the seat and wakes rested after 7.5 ± 0.8 game
   hours, the car moved under 0.6 m.
5. **Survival (water):** thirst wears in pips, slows stamina recovery, and a found bottle drunk with V fixes it.
6. **Climate:** an hour and a half in the open at 13:00 → air > 34 °C and warmth > 0.6; soaked to 0.8 at noon, dry
   under 0.2 within the hour; at 02:00 an hour in the open → warmth < 0.45, and soaked → 0.02 lower still; warmth 0.1 →
   FREEZING, speedMul < 0.9, sway ≥ 1.25, and a 1 s held walk covers under 92% of the comfortable walk; two hours at
   night in a house from warmth 0.12 → not rough, warmth > 0.25, cold pip ≤ 1.
7. **Wounds:** bullet hits from a person cut within 14 hits; an open cut loses health over 12 s, a bandage stops it;
   a bandaged, unclean cut at dirt 0.9 infects within 3 game hours (healMul ≤ 0.5) and antibiotics clear it; a
   disinfected cut stays clean and never infects; a car's blows break a bone within 14; the break walks under 70% of a
   whole walk, a splint sets it and walks 15% further (still short of whole); a second splint is refused; a bite leaves
   an open bite wound; a sprain mends off the clock.
8. **Mood:** three infected 7 m off → PANICKED or worse within 4.5 s, sway ≥ 1.35, sight ≤ 0.75 and the HUD's clear
   ring under 40%; painkillers take fear down 3; 5 s under a roof takes it down 1.5 more; 6 idle game hours → BORED; 4
   game hours walking take boredom down 3; gloom 7 (DEPRESSED) mends under 80% of a calm body's 2 s; a conversation
   lifts gloom 2.
9. **Shelter:** a full night in a bed under a roof (doors, a box) makes it your hold; with 6 bottles stored, an hour
   asleep there gives more rest than an hour in another house, more than in a parked car's seat, more than on the open
   ground; the hold's rest x ≥ 1.14, danger 0, its doors barred while asleep and unbarred on waking; at 03:00 a parked
   car feels at least 4 °C colder than a house; on the open ground with the risk due, a prowler spawns and wakes you.
10. **Car upkeep:** 90 s flat out → 0.8 < peak ≤ 1 at 15:00, < 0.5 at 03:00, > 1 at 15:00 on low oil; 5 game hours
    running burn oil; a quart of motor oil from the pack adds 0.35+; worn tyres grip under 70%; worn brakes stop from
    18 m/s at least 1.5x as far; at Kenji's yard 4.5 game hours bring engine wear 0.8 under 0.65, oil over 0.8, dents
    0.6 under 0.3 and the engine part 0.4 over 0.6; a car in the open weathers.
11. **Telltales:** parched, freezing, panicked and a bleeding cut light their lamps (the cut's word BLEEDING), the
    CONDITION falls under 65, and the body comes back from a save as it was.
12. All on fresh pages, twice in a row, with every other selftest check green; `node tools/ip-lint.mjs` 0 deny.
