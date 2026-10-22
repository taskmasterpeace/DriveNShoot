// Society defaults (docs/design/WEB_WORLD_MEMORY.md): the verbs a deed can be, the standing tiers, and the built-in
// factions. Content packs add rows (pack section `factions`, or the registerFaction command); a row may override any
// field, including its own tier lines.

// Base magnitude of each verb. Kills are scaled further by who died (see deeds.js).
export const VERBS = { hurt: 1, carjack: 2, steal: 2, rob: 3, destroy: 2, kill: 4, silence: 6, rescue: 3, deliver: 2, trade: 0.5, pay: 2, defend: 3, betray: 5 };

// Standing (-100..100) to tier. Behaviour changes at each line: hostile and hunted shoot on sight.
export const TIERS = { hunted: -80, hostile: -40, wary: -10, neutral: 20, friendly: 60 };
export const TIER_NAMES = ['hunted', 'hostile', 'wary', 'neutral', 'friendly', 'allied'];
export function tierOf(s, t = TIERS) {
  if (s <= t.hunted) return 'hunted';
  if (s <= t.hostile) return 'hostile';
  if (s < t.wary) return 'wary';
  if (s < t.neutral) return 'neutral';
  if (s < t.friendly) return 'friendly';
  return 'allied';
}

// What a named person can remember about the player (phase 2). base: opinion points at full weight; days: the
// half-life; revenge ≥ 0.8 starts a vendetta (an armed person attacks on sight); stack: same-kind memories add up to
// this weight instead of refreshing; clears: remembering this one wipes that kind. `say` lines are spoken to you:
// {about} is the person it concerns.
export const MEMORY_KINDS = {
  killedKin: { base: -70, days: 120, revenge: 1, say: 'You put my {about} in the ground. Get out of my sight.' },
  shotKin: { base: -45, days: 60, revenge: 0.5, say: 'You shot my {about}. Doc Reyes dug the lead out. I have not forgotten.' },
  killedFriend: { base: -45, days: 90, revenge: 0.5, say: '{about} was my friend. You killed {about}.' },
  shotMe: { base: -40, days: 30, revenge: 0.5, say: 'You shot me. Keep your distance.' },
  robbedMe: { base: -35, days: 30, say: 'You took what was mine.' },
  betrayed: { base: -50, days: 90, revenge: 0.8, say: 'I trusted you once.' },
  sawKill: { base: -25, days: 30, say: 'I saw what you did to {about}.' },
  owesMe: { base: -10, days: 30, say: 'You still owe me.' },
  savedMe: { base: 45, days: 60, say: 'You pulled me out of that. I do not forget.' },
  savedKin: { base: 35, days: 60, say: 'You saved my {about}. Anything you need.' },
  helped: { base: 15, days: 45, say: 'Good work out there.' },
  paidDebt: { base: 15, days: 45, clears: 'owesMe', say: 'We are square.' },
  traded: { base: 2, days: 30, stack: 5, say: '' },
  gift: { base: 10, days: 30, say: 'Thanks for the gift.' },
};

// values: how much one unit of deed magnitude moves this faction's standing. Keys are looked up in order
// verb:self (done to us) → verb:<faction id> → verb:enemy (relation ≤ -50) → verb:friend (≥ 50) → verb:any.
export const FACTIONS = {
  rusthaven: {
    name: 'Rust Haven', archetype: 'town', color: '#d9a441', start: 10, stars: true, forgivesSelfDefense: true,
    cohesion: 0.7, memoryDays: 14, rumorDelay: [20, 45], hub: [0, 0], leaders: ['okonkwo'],
    relations: { dustwolves: -100, infected: -100, drifters: 40 },
    values: {
      'kill:self': -9, 'hurt:self': -2, 'carjack:self': -4, 'steal:self': -3, 'destroy:self': -3, 'rob:self': -5, 'silence:self': -6, 'betray:self': -8,
      'kill:friend': -4, 'hurt:friend': -1, 'carjack:friend': -2,
      'kill:enemy': 1, 'rescue:self': 5, 'rescue:friend': 3, 'deliver:self': 4, 'trade:self': 0.5, 'defend:self': 4, 'pay:self': 2,
    },
  },
  dustwolves: {
    name: 'The Dustwolves', archetype: 'raiders', color: '#b0301e', start: -60, stars: false, forgivesSelfDefense: false,
    cohesion: 0.7, memoryDays: 14, rumorDelay: [20, 45], hub: null, leaders: [],
    relations: { '*': -100 },
    values: { 'kill:self': -8, 'hurt:self': -2, 'kill:enemy': 0.6, 'carjack:any': 0.5, 'rob:any': 0.5, 'deliver:self': 5, 'trade:self': 1, 'pay:self': 3 },
  },
  drifters: {
    name: 'Drifters', archetype: 'loose', color: '#9a8a6a', start: 0, stars: false, forgivesSelfDefense: true,
    cohesion: 0.35, memoryDays: 10, rumorDelay: [30, 70], hub: null, leaders: [],
    // Drifters only run from raiders; they don't hunt them, so the relation stays above the -50 war line.
    relations: { rusthaven: 40, dustwolves: -45, infected: -100 },
    values: { 'kill:self': -7, 'hurt:self': -1.5, 'carjack:self': -3, 'rob:self': -4, 'rescue:self': 4, 'kill:enemy': 0.5, 'trade:self': 0.5 },
  },
  infected: {
    name: 'the infected', archetype: 'infected', color: '#7d8a6a', start: -100, memory: 'none',
    relations: { '*': -100 }, values: {},
  },
};
