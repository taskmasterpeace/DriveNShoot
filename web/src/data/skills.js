// Body skills grow by doing - no points to spend (the survival-sim way; our own numbers). Level 0..10; the xp to
// reach the next level is XP_BASE · XP_GROWTH^level, so early levels come in an evening and the last take a campaign.
export const SKILLS = {
  strength: { label: 'STRENGTH', short: 'STR', what: 'how much you carry before it slows you' },
  dexterity: { label: 'DEXTERITY', short: 'DEX', what: 'tighter shots, faster reloads' },
  endurance: { label: 'ENDURANCE', short: 'END', what: 'stamina that lasts' },
};
export const MAX_LEVEL = 10, XP_BASE = 60, XP_GROWTH = 1.45;

// Where xp comes from (per event, or per second of doing it).
export const XP = {
  dexterity: { hit: 3, reload: 1.5 },
  endurance: { sprintPerSec: 0.6, swimPerSec: 0.8 },
  strength: { heavyPerSec: 0.5, heavyAt: 0.6 }, // moving with at least 60% of your capacity on you
};

// What a level is worth.
export const PER_LEVEL = { spread: 0.035, reload: 0.03, sprintDrain: 0.04, carryKg: 3.5 };

// What things weigh (kg). Rocks are free: they're on the ground wherever you are.
export const CARRY = { baseKg: 24, slowAt: 0.75, slowSpeed: 0.9, slowDrain: 1.3, overSpeed: 0.72 };
export const ITEM_KG = {
  weapon: { pistol: 1.2, smg: 3.2, shotgun: 3.3, rifle: 3.8, auto: 1.0, pump: 3.4 },
  round: { pistol: 0.012, smg: 0.008, shells: 0.045, rifle: 0.025 },
  throwable: { frag: 0.4, molotov: 0.8, smoke: 0.45, flash: 0.3, pipe: 0.7, sticky: 0.5, rock: 0 },
};
