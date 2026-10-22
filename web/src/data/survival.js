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
  quality: { bed: 1, bedroll: 0.8, ground: 0.5 },
  microsleep: { every: [35, 80], secs: 1.4 },
};

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
