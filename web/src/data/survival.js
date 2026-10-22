// Survival needs (fan service for the survival-sim genre, our own numbers and words; the bible calls the ladder
// WEAR). Each need runs 0 (empty) .. 1 (full) and drains on the game clock (a game hour is 30 real seconds).
// Below each line in STAGES the need wears one pip deeper; EFFECTS[need][pip] is what that pip costs you.
export const NEEDS = {
  // Arizona: water first. 40 game hours from full to empty at rest (20 real minutes); sprinting sweats it out
  // twice as fast, and the daytime heat adds a quarter.
  water: { label: 'WATER', start: 0.85, drainPerHour: 1 / 40, sprint: 2, dayHeat: 1.25, words: ['', 'THIRSTY', 'PARCHED', 'DEHYDRATED', 'DYING OF THIRST'] },
  food: { label: 'FOOD', start: 0.8, drainPerHour: 1 / 80, sprint: 1.3, dayHeat: 1, words: ['', 'PECKISH', 'HUNGRY', 'WEAK WITH HUNGER', 'STARVING'] },
};

// Pip lines: at or below 0.35 → 1, 0.18 → 2, 0.06 → 3, 0 → 4.
export const STAGES = [0.35, 0.18, 0.06, 0];

// staminaRegen and maxStamina multiply; hpPerMin is per real minute; vignette is the edge darkening the HUD may draw.
export const EFFECTS = {
  water: [{}, { staminaRegen: 0.85 }, { staminaRegen: 0.65, vignette: 0.15 }, { staminaRegen: 0.4, maxStamina: 0.75, vignette: 0.35, hpPerMin: -3 }, { staminaRegen: 0.25, maxStamina: 0.5, vignette: 0.55, hpPerMin: -8 }],
  food: [{}, { staminaRegen: 0.92 }, { staminaRegen: 0.8, maxStamina: 0.85 }, { staminaRegen: 0.65, maxStamina: 0.65, hpPerMin: -1 }, { staminaRegen: 0.45, maxStamina: 0.45, hpPerMin: -3 }],
};

// What restores a need. Pickup kinds and shop goods both point here.
export const CONSUMABLES = {
  water: { need: 'water', amount: 0.45, hp: 0, text: '+ WATER' },          // a bottle off a shelf
  canteen: { need: 'water', amount: 0.65, hp: 15, text: '+ WATER' },       // Mags's filtered water
  food: { need: 'food', amount: 0.35, hp: 5, text: '+ FOOD' },             // a can of something
};
