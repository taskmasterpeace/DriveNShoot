// Survival needs (fan service for the survival-sim genre, our own numbers and words; the bible calls the ladder
// WEAR). Each need runs 0 (empty) .. 1 (full) and drains on the game clock (a game hour is 30 real seconds).
// Below each line in STAGES the need wears one pip deeper; EFFECTS[need][pip] is what that pip costs you.
export const NEEDS = {
  // Arizona: water first. 40 game hours from full to empty at rest (20 real minutes); sprinting sweats it out
  // twice as fast, and the daytime heat adds a quarter.
  water: { label: 'WATER', start: 0.85, drainPerHour: 1 / 40, sprint: 2, dayHeat: 1.25, words: ['', 'THIRSTY', 'PARCHED', 'DEHYDRATED', 'DYING OF THIRST'] },
  food: { label: 'FOOD', start: 0.8, drainPerHour: 1 / 80, sprint: 1.3, dayHeat: 1, words: ['', 'PECKISH', 'HUNGRY', 'WEAK WITH HUNGER', 'STARVING'] },
  // Rest: only sleep fills it. 20 game hours awake from rested to empty (10 real minutes): you sleep once a game day,
  // and a day of hard running tires you a third faster.
  rest: { label: 'REST', start: 0.9, drainPerHour: 1 / 20, sprint: 1.35, dayHeat: 1, words: ['', 'TIRED', 'WEARY', 'EXHAUSTED', 'DEAD ON YOUR FEET'] },
};

// Pip lines: at or below 0.35 → 1, 0.18 → 2, 0.06 → 3, 0 → 4.
export const STAGES = [0.35, 0.18, 0.06, 0];

// staminaRegen and maxStamina multiply; hpPerMin is per real minute; vignette is the edge darkening the HUD may draw.
export const EFFECTS = {
  water: [{}, { staminaRegen: 0.85 }, { staminaRegen: 0.65, vignette: 0.15 }, { staminaRegen: 0.4, maxStamina: 0.75, vignette: 0.35, hpPerMin: -3 }, { staminaRegen: 0.25, maxStamina: 0.5, vignette: 0.55, hpPerMin: -8 }],
  food: [{}, { staminaRegen: 0.92 }, { staminaRegen: 0.8, maxStamina: 0.85 }, { staminaRegen: 0.65, maxStamina: 0.65, hpPerMin: -1 }, { staminaRegen: 0.45, maxStamina: 0.45, hpPerMin: -3 }],
  // A tired body shakes: sway multiplies the player's weapon spread. Dead on your feet, the eyes close on their own.
  rest: [{}, { staminaRegen: 0.92 }, { staminaRegen: 0.8, sway: 1.15 }, { staminaRegen: 0.6, maxStamina: 0.75, sway: 1.35, vignette: 0.2 }, { staminaRegen: 0.4, maxStamina: 0.5, sway: 1.6, vignette: 0.4, microsleep: true }],
};

// Sleep. Time runs x40 while you're under; REST refills perHour a game hour times the place's quality (a bed is
// a full night in 7 game hours, a bedroll in 9, the bare ground never quite); water and food drain at `drain` of their
// waking rate. A full night is one you wake from rested (not woken), `fullNight` game hours of it at least: a nap
// breaks no fever. You can lie down only below `tiredBelow` REST. You wake rested, at `maxHours`, or woken: hurt, a
// hostile or one of the infected within `wakeR` m, a noise that reaches you (`wakeNoise` m at most). Dead on your feet
// (REST pip 4), every `every` seconds the eyes close for `secs`: the screen goes and the hands let go, at the wheel too.
export const SLEEP = {
  perHour: 1 / 7, drain: 0.5, fullNight: 3, maxHours: 11, wakeR: 12, wakeNoise: 40, tiredBelow: 0.85,
  quality: { bed: 1, bedroll: 0.8, car: 0.65, ground: 0.5 }, // a car: a parked one, in its seat (N)
  microsleep: { every: [35, 80], secs: 1.4 },
};

// The town sleeps too (systems/ai.js). From `from` to `to` o'clock its own people (drifters, named townsfolk; never
// the law on night shift, soldiers, raiders or your followers) go to a bed within `bedR` m of home nobody has claimed
// tonight, else the floor at home (given `giveUp` s to get there), and sleep till dawn. A noise wakes them only within
// `hearAsleep` of its reach (asleep, behind walls: gunfire at the town wall doesn't wake the far side of town), and
// pain, a fight they're pulled into, or someone standing at the bedside for `wakeStand` s does; then they stay up
// `restless` s. Asleep, they witness nothing (deeds.js) and a trader keeps no counter (trade.js).
export const TOWN_NIGHT = { from: 22, to: 6, bedR: 25, giveUp: 25, wakeStand: 1.5, restless: 45, hearAsleep: 0.45 };

// BITE FEVER (canon: docs/design/THE_INFECTED.md §3.6). A bite from the infected that lands starts it, or starts its
// clock again. It runs `hours` game hours and taxes the body (stamina regen, hunger, a little sway and a little dark at
// the edges); antibiotics and then a full night's sleep break it early. It never kills by itself, and the player
// never turns: a fever is a dirty wound, and that is all the game will ever say.
export const FEVER = { hours: 36, staminaRegen: 0.75, foodDrain: 1.3, sway: 1.1, vignette: 0.12 };

// What restores a need. Pickup kinds and shop goods both point here.
export const CONSUMABLES = {
  water: { need: 'water', amount: 0.45, hp: 0, text: '+ WATER' },          // a bottle off a shelf
  canteen: { need: 'water', amount: 0.65, hp: 15, text: '+ WATER' },       // Mags's filtered water
  food: { need: 'food', amount: 0.35, hp: 5, text: '+ FOOD' },             // a can of something
};

// =====================================================================================================================
// THE BODY, DEEPENED (docs/design/WEB_SURVIVAL.md §3.6-3.12). The structure is borrowed from Robert's own needs layer in
// his superhero game (D:/lsw src/data/psyche.js, medical.js), translated rather than copied:
//   · A MULTIPLIER LAYER, NOT A SECOND GAME. Every state below reaches play through the same few single consumers on
//     g.needs: staminaRegen and maxStamina (the stamina tank, main.js), sway (the player's spread, combat.js), speedMul
//     (the one foot-speed line, main.js), healMul (the out-of-combat mend and the wounds' own clocks) and sight (how much
//     of the view stays clear: the tunnel the HUD draws). Nothing here reaches into another system.
//   · AN EVENT IS APPRAISED, NOT LOOKED UP (psyche.js). Mood events push three DRIVES (safety, company, purpose); a
//     thwarted drive raises its mood (fear, gloom, boredom), a served one lowers it.
//   · ONE CONDITION READING ("expose one Condition bar"): CONDITION folds every state into a 0-100 number and a word.
// The survival-sim genre's mechanics (cold and heat, wet clothes, wounds that want the right treatment, infection, panic,
// gloom, boredom), our own numbers and our own words.

// Which layers run. `full` is the game. `battery` is the engine selftest's: water, food, rest and the fever run as they
// always have, while the climate, wounds, mood, shelter and car upkeep hold still unless a check drives them (the battery spends
// hours of game time on other systems; a cold night must not fail a door check). The profile chooses the burden.
export const PROFILES = {
  full: { climate: true, injuries: true, mood: true, shelter: true, upkeep: true },
  battery: { climate: false, injuries: false, mood: false, shelter: false, upkeep: false },
};

// The air. A desert day: coldest just before dawn, hottest mid-afternoon (degrees C, a cosine between the two). Weather
// shifts it; shelter pulls what you feel toward its `to` by its `pull` (SHELTER). Warmth is the body's 0 (frozen) .. 0.5
// (comfortable) .. 1 (cooked); it drifts toward 0.5 + (felt - comfort) / span at `rate` of the gap a game hour.
// Sprinting adds `sprintHeat` degrees; soaked clothes feel `wetChill` degrees colder; asleep, what you lie under helps.
export const CLIMATE = {
  low: 6, high: 41, lowAt: 5, highAt: 15,
  weather: { CLEAR: 0, OVERCAST: -3, RAIN: -7, STORM: -9, DUST: 2, FOG: -4, ASHFALL: -6 },
  comfort: 20, span: 40, rate: 0.5, sprintHeat: 6, wetChill: 11,
  asleepWarm: { bed: 5, bedroll: 7, car: 2, ground: 0 },
};

// Two-sided: cold pips count down from 0.5, heat pips up.
export const WARMTH = {
  cold: { lines: [0.35, 0.25, 0.15, 0.06], words: ['', 'CHILLY', 'COLD', 'FREEZING', 'HYPOTHERMIC'] },
  hot: { lines: [0.65, 0.75, 0.85, 0.94], words: ['', 'WARM', 'HOT', 'OVERHEATING', 'HEATSTROKE'] },
};

// Wet: rain on you in the open (not under a roof, not in a closed car) soaks you at `rain` a game hour times the rain's
// weight; water you wade or swim in soaks you at once. You dry at `dry` a game hour, x heatDry at noon's heat, x indoorDry
// under a roof.
export const WET = { rain: 1.6, dry: 0.45, heatDry: 1.5, indoorDry: 2, lines: [0.15, 0.4, 0.7, 0.95], words: ['', 'DAMP', 'WET', 'SOAKED', 'DRENCHED'] };

// What each pip of a body state costs. EFFECTS' keys, plus speedMul (foot speed), healMul (mending), sight (the share of
// the view left clear), waterMul (how fast you sweat water away), foodMul, gloomMul (boredom feeding gloom).
export const BODY_EFFECTS = {
  cold: [{}, {}, { sway: 1.1, speedMul: 0.95, healMul: 0.85 }, { sway: 1.25, speedMul: 0.85, staminaRegen: 0.8, healMul: 0.6, hpPerMin: -1 }, { sway: 1.45, speedMul: 0.7, staminaRegen: 0.6, maxStamina: 0.7, healMul: 0.3, hpPerMin: -4, sight: 0.8 }],
  hot: [{}, { waterMul: 1.15 }, { waterMul: 1.35, staminaRegen: 0.85 }, { waterMul: 1.6, staminaRegen: 0.7, maxStamina: 0.8, vignette: 0.2, sight: 0.85 }, { waterMul: 2, staminaRegen: 0.5, maxStamina: 0.6, vignette: 0.4, hpPerMin: -4, sight: 0.7 }],
  wet: [{}, {}, {}, { speedMul: 0.97 }, { speedMul: 0.95, staminaRegen: 0.9 }],
};

// ---- wounds ---------------------------------------------------------------------------------------------------
// A wound is a row: what it costs while open (`eff`) and once dressed (`dressed`), the game hours it takes to mend
// (`heal`, run at healMul), the hp a real minute it bleeds until bandaged (`bleeds`), and the dirt it gathers a game hour
// until disinfected (`dirt`: at 1 it is WOUND INFECTION). `needs` is the treatment that matters: bandage (stop the blood,
// dress it), disinfect (stop the dirt), splint (a joint or a bone). `slow`: how fast an unsplinted sprain or break mends
// (a break left unset barely knits). `hpPerMin` hurts until it is dressed (a burn).
export const INJURIES = {
  laceration: { label: 'GASHED', icon: 'cut', bleeds: 6, heal: 30, dirt: 0.05, needs: ['bandage', 'disinfect'], eff: { sway: 1.05 }, dressed: {} },
  bite: { label: 'BITTEN', icon: 'bite', bleeds: 0, heal: 40, dirt: 0, needs: ['bandage'], eff: { sway: 1.05 }, dressed: {} }, // its dirt is the fever (FEVER)
  sprain: { label: 'SPRAINED', icon: 'joint', bleeds: 0, heal: 24, dirt: 0, needs: ['splint'], slow: 0.5, eff: { speedMul: 0.85, staminaRegen: 0.9 }, dressed: { speedMul: 0.95 } },
  fracture: { label: 'BROKEN BONE', icon: 'bone', bleeds: 0, heal: 140, dirt: 0, needs: ['splint'], slow: 0.2, eff: { speedMul: 0.6, maxStamina: 0.6, sway: 1.15 }, dressed: { speedMul: 0.82, maxStamina: 0.85, sway: 1.05 } },
  burn: { label: 'BURNED', icon: 'burn', bleeds: 0, heal: 50, dirt: 0.08, needs: ['bandage', 'disinfect'], hpPerMin: -1, eff: { staminaRegen: 0.85, healMul: 0.85 }, dressed: { staminaRegen: 0.95 } },
};
export const MAX_WOUNDS = 6;

// Where wounds come from: the cause of a hit that lands on you, as [kind, chance, at least this much damage]. A 'bullet'
// with nobody behind it is a fall (off a train at speed, out of a moving car): `impact`.
export const WOUND_FROM = {
  bullet: [['laceration', 0.6, 6]],
  glass: [['laceration', 0.9, 1]],
  bite: [['bite', 1, 1]],
  bash: [['sprain', 0.3, 1]],
  vehicle: [['fracture', 0.5, 20], ['sprain', 0.6, 5]],
  explosion: [['burn', 0.7, 5], ['fracture', 0.25, 30]],
  impact: [['sprain', 0.5, 8], ['fracture', 0.2, 25]],
  fire: [['burn', 1, 0]],
};

// WOUND INFECTION: a wound gone dirty. It costs the body while it runs; past `hurtsAfter` game hours it takes health.
// Antibiotics (the pills that treat a bite fever) clear it. It never comes from a bite (that is the fever's) and never
// turns you.
export const INFECTION = { eff: { healMul: 0.5, staminaRegen: 0.85, vignette: 0.1, sway: 1.05 }, hurtsAfter: 24, hpPerMin: -1.5 };
// FOOD POISONING: something that had turned. `hours` of it: water drains faster, the stomach won't hold food.
export const SICKNESS = { poisoning: { hours: 10, eff: { staminaRegen: 0.75, waterMul: 1.5, foodMul: 1.3, sway: 1.05 } } };

// What a carried thing does to the body or the car, by item id (inventory.js asks survival.useItem before the item's own
// hp and bleed land). bandage dresses an open wound (the blood stops, its open costs become its dressed ones); disinfect
// stops a wound's dirt; splint sets a sprain or a break; heal multiplies the mending of what it treated; calm takes fear
// down; gloom lifts it (a good meal); oil pours into the car you are in or beside. dirty: a rag stops blood but adds dirt.
// `only` limits it to one kind of wound. A thing whose job has nothing to work on is refused and not used up.
export const TREATMENTS = {
  rag: { bandage: true, dirty: 0.25 },
  bandage: { bandage: true },
  suture_kit: { bandage: true, disinfect: true, heal: 1.6 },
  first_aid: { bandage: true, disinfect: true, splint: true, heal: 1.3 },
  splint: { splint: true, must: true },
  disinfectant: { disinfect: true, must: true },
  burn_salve: { bandage: true, disinfect: true, heal: 1.8, only: 'burn', must: true },
  painkillers: { calm: 3 },
  honey: { gloom: 1 },
  peaches_tin: { gloom: 0.7 },
  ration: { gloom: 0.5 },
  motor_oil: { oil: 0.4, must: true },
};

// New things to carry for the rows above: added to data/items.js ITEMS at boot (systems/survival.js) along with the
// loot rows that can turn them up (MED_LOOT: [item, weight, min, max] into a LOOT table's rows).
export const MED_ITEMS = {
  splint: { name: 'Splint', kind: 'med', kg: 0.3, bulk: 0.6, stack: 2, value: 16, use: { hp: 2 },
    desc: 'Two slats off a yardstick and a roll of tape. Set it, tape it, and stay off it while it takes.' },
  disinfectant: { name: 'Disinfectant', kind: 'med', kg: 0.25, bulk: 0.25, stack: 1, value: 20, uses: 4, use: { hp: 1 },
    desc: 'A brown bottle of iodine, the label gone soft. It stings. That is the point.' },
  burn_salve: { name: 'Burn salve', kind: 'med', kg: 0.1, bulk: 0.1, stack: 3, value: 22, use: { hp: 4 },
    desc: 'A flat tin of greasy ointment that smells of pine tar. Cools a burn and keeps the dirt out of it.' },
  motor_oil: { name: 'Motor oil', kind: 'part', kg: 1.0, bulk: 1.1, stack: 3, value: 14, use: {},
    desc: 'A quart of oil in a plastic jug, gritty at the bottom. An engine running dry wants this before anything.' },
};
export const MED_LOOT = {
  bathroom: [['splint', 2, 1, 1], ['disinfectant', 3, 1, 1], ['burn_salve', 1, 1, 1]],
  military: [['splint', 2, 1, 2], ['disinfectant', 2, 1, 1]],
  garage: [['motor_oil', 3, 1, 2]],
  pumps: [['motor_oil', 3, 1, 2]],
};

// ---- mood (the appraisal) --------------------------------------------------------------------------------------
// Three drives. A thwarted drive raises its mood; a served one lowers it. Values run 0..10 (the wheel's 1-10, from zero),
// pips at `lines`. Fear lives in real seconds (a gunfight is over in a minute); gloom and boredom on the game clock.
// `fade`: how fast a mood settles on its own (a real second for fear, a game hour for the others).
export const MOODS = {
  fear: { drive: 'safety', clock: 'real', fade: 0.12, lines: [2, 4, 6.5, 8.5], words: ['', 'UNEASY', 'AFRAID', 'PANICKED', 'TERRIFIED'] },
  gloom: { drive: 'company', clock: 'game', fade: 0.12, lines: [2.5, 4.5, 6.5, 8.5], words: ['', 'LOW', 'GLOOMY', 'DEPRESSED', 'HOPELESS'] },
  boredom: { drive: 'purpose', clock: 'game', fade: 0.3, lines: [2.5, 4.5, 6.5, 8.5], words: ['', 'RESTLESS', 'BORED', 'STIR-CRAZY', 'NUMB'] },
};
// What an event or a standing pressure does to the drives (negative thwarts). Events push once; a pressure (`per`)
// pushes a real second (fear's) or a game hour while it holds. hostileNear and infectedNear count each one, up to three.
export const APPRAISALS = {
  hurt: { safety: -1.6 },                               // a hit lands on you (x its size: a 30-point hit counts double)
  hostileNear: { safety: -0.45, per: 'second' },        // each one within 30 m who means to kill you
  infectedNear: { safety: -0.6, per: 'second' },        // each of the infected within 14 m
  darkOutside: { safety: -0.04, per: 'second' },        // night, in the open, on foot
  sheltered: { safety: 0.25, per: 'second' },           // under a roof or in a closed car, nothing after you
  killed: { safety: 0.6, purpose: 1.2 },                // you put one down
  allyDied: { company: -4 },                            // one who rode with you
  talked: { company: 2.2, purpose: 0.4 },               // a conversation, a trade
  alone: { company: -0.22, per: 'hour' },               // nobody about
  company: { company: 0.6, per: 'hour' },               // someone riding with you
  idle: { purpose: -1.1, per: 'hour' },                 // standing about with nothing happening
  busy: { purpose: 0.9, per: 'hour' },                  // on the move, at the wheel, in a fight
  searched: { purpose: 0.6 },                           // a shelf or a crate gone through
  restedInHold: { company: 1.5, safety: 3, purpose: 0.5 }, // a full night in your own place
};
export const MOOD_EFFECTS = {
  fear: [{}, {}, { sway: 1.15, sight: 0.9 }, { sway: 1.35, sight: 0.75, speedMul: 1.05 }, { sway: 1.6, sight: 0.6, speedMul: 1.08, vignette: 0.15 }],
  gloom: [{}, {}, { healMul: 0.85 }, { healMul: 0.7, speedMul: 0.93, staminaRegen: 0.9 }, { healMul: 0.55, speedMul: 0.85, staminaRegen: 0.8, vignette: 0.15 }],
  boredom: [{}, {}, { gloomMul: 1.5 }, { gloomMul: 2.2, sight: 0.95 }, { gloomMul: 3, sight: 0.9 }],
};

// ---- shelter --------------------------------------------------------------------------------------------------
// You live out of your car, or out of a house, or not for long. Where you are decides how a night rests you (`rest`
// multiplies the bed's own quality), how much of the cold and heat it keeps out (`pull` toward `to` degrees), and the
// danger while you sleep (`danger` a game hour: the risk builds until something finds you). A HOLD is a house made
// yours: a full night in a bed under its roof claims it. It rests you best when its doors bar from inside and water
// is stored in it (HOLD).
export const SHELTER = {
  hold: { label: 'YOUR HOLD', rest: 1.05, pull: 0.8, to: 22, danger: 0.02 },
  house: { label: 'INDOORS', rest: 1, pull: 0.7, to: 22, danger: 0.06 },
  car: { label: 'IN THE CAR', rest: 1, pull: 0.3, to: 20, danger: 0.05, running: 0.75 }, // the seat is already cramped (SLEEP.quality.car); `running`: the pull with the engine on (heater, vents)
  rough: { label: 'SLEEPING ROUGH', rest: 0.85, pull: 0, to: 20, danger: 0.18 },
};
export const HOLD = { door: { rest: 0.05, danger: 0 }, water: { rest: 0.05, uses: 6 } };
// The cold or the heat costs a night: at each pip of either, the night rests you at this share of the place's quality.
export const SLEEP_COMFORT = { cold: [1, 0.9, 0.8, 0.6, 0.45], hot: [1, 0.95, 0.85, 0.7, 0.55] };
// When the risk comes due: at night one of the infected, by day a drifter after your things, `r` m off and walking
// in. The sleeper's own watch (SLEEP.wakeR) is what wakes you.
export const PROWL = { r: 24, jitter: [0.5, 1.5] };

// ---- one reading -----------------------------------------------------------------------------------------------
// CONDITION 100 = nothing wrong. Each pip anywhere costs `pip` x its weight; a wound `wound`, an open one `open` more;
// an infection, a fever or food poisoning `sick`. Words by band.
export const CONDITION = {
  pip: 3, weights: { water: 1.4, food: 1, rest: 1.2, cold: 1.2, hot: 1.2, wet: 0.4, fear: 0.8, gloom: 0.8, boredom: 0.4 }, wound: 5, open: 4, sick: 12,
  words: [[85, 'SOUND'], [65, 'WORN'], [45, 'HURTING'], [25, 'FAILING'], [0, 'DYING']],
};

// ---- car upkeep (systems/upkeep.js) ------------------------------------------------------------------------------
// Fuel and engine heat were already there (vehicledamage.js); this adds oil, the desert's heat on the radiator, and wear.
//   oil      0..1 of a full sump. Burns `burn` a game hour with the engine running (+ wornBurn x engine wear). Under `low`
//            the engine runs hot (cooling x lowCool) and wears x lowWear; dry, it loses power (x dryPower) and the engine
//            itself takes `dryEngine` a second under throttle.
//   ambient  the air's heat on the radiator: `load` extra heat a second at full throttle per unit of (air - from) / span,
//            and an engine never cools below `soak` of that unit (heat soak under the noon sun); a dust storm adds `dust`.
//   wear     0 new .. 1 gone. tyres `tyresPerKm` a km (x skid sliding); brakes `brakesPerSec` a second braking at 20 m/s;
//            engine `enginePerHour` a game hour running (x hot boiling, x lowWear on low oil). Past `from` it costs, through
//            vehicledamage.effects' own modifiers: grip (tyres), braking (brakes), power and top speed (engine).
//   parked   a car left in the open weathers `weather` of wear a game hour on every part.
export const CAR_UPKEEP = {
  oil: { start: [0.7, 1], burn: 0.015, wornBurn: 0.05, low: 0.25, lowCool: 0.7, lowWear: 3, dryPower: 0.55, dryEngine: 0.02 },
  ambient: { from: 18, span: 22, load: 0.024, soak: 0.3, dust: 0.006 },
  wear: { tyresPerKm: 0.004, skid: 3, brakesPerSec: 0.0012, enginePerHour: 0.004, hot: 4,
    tyres: { from: 0.4, grip: 0.4 }, brakes: { from: 0.3, brake: 0.65 }, engine: { from: 0.5, power: 0.35, top: 0.15 } },
  parked: { weather: 0.0015 },
  warn: { oil: 0.25, tyres: 0.6, brakes: 0.6, engine: 0.6, temp: 0.8, fuel: 0.15 },
};
// Garages: a car parked inside one (no driver, under 0.3 m/s) is out of the weather and is put right over time (`per` a
// game hour: wear taken back, oil topped up, engine/radiator/tank/tyres and dents mended). Rows: Kenji's yard in Rust
// Haven (his workshop and `yard` m of ground round its walls, found from where he works), and every WORKSHOP of the
// Phoenix ring (its vehicle bay; ring kind 'shop').
export const GARAGE_BAYS = {
  per: { wear: 0.06, oil: 0.2, parts: 0.08, dents: 0.1 },
  places: [{ id: 'kenji', name: "KENJI'S YARD", npc: 'kenji', yard: 8 }],
  ringKinds: ['shop'],
};
