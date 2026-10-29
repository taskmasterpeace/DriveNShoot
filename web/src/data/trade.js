// Who trades, in what, and what standing does to a price (docs/design/WEB_TRADE.md). A trader's stock is the
// shelves and crates of their own shop; with them at the counter, taking is buying and putting is selling.

// By named person (data/npcs.js id): what they will buy from you (item kinds or ids) and the name the PACK screen
// calls them by. They sell whatever is on their shelves.
export const TRADERS = {
  // keeps: [item, n] he never lets run out - topped up to n across his shelves on the first look each day (his rounds of
  // every common kind and a cleaning kit; the guns are whatever second-hand pieces came in: the counter is the stock).
  // ...and the bangs (data/gadgets.js): a pair of car mines, a fan mine, a remote charge, a breach frame.
  ike: { name: 'Ike', deals: ['gun', 'ammo', 'tool', 'fan_mine', 'remote_charge', 'breach_charge', 'crawler_mine', 'gas_can'], keeps: [['ammo_pistol', 24], ['ammo_smg', 60], ['ammo_shells', 8], ['ammo_rifle', 30], ['cleaning_kit', 1], ['car_mine', 2], ['fan_mine', 1], ['remote_charge', 2], ['breach_charge', 1]] },
  reyes: { name: 'Doc Reyes', deals: ['med'] },
  // Kenji's hardware (data/gadgets.js): what stops a car or tells you who came, and a scout drone with a cracked eye.
  kenji: { name: 'Kenji', deals: ['part', 'tool', 'pack', 'gadget', 'drone'], keeps: [['road_chain', 1], ['spike_strip', 1], ['tripwire_bells', 3], ['noise_maker', 2], ['signal_flare', 4], ['smoke_canister', 2], ['car_alarm', 1], ['planks', 2], ['door_wedge', 3], ['drone_scout', 1]] },
  mags: { name: 'Mags', deals: ['water', 'food', 'valuable', 'paper', 'hide'] }, // hides: the fauna layer's (data/fauna.js)
};

// What a thing costs and fetches, by the standing of the trader's people with you (data/society.js tiers): buy is
// paid over its worth, sell is the share of its worth you get. Hostile and hunted get no deal; a trader who holds a
// grudge against you personally (memory.refuses) gives none either.
export const PRICE_TIER = {
  hunted: null,
  hostile: null,
  wary: { buy: 1.6, sell: 0.25 },
  neutral: { buy: 1.3, sell: 0.4 },
  friendly: { buy: 1.15, sell: 0.5 },
  allied: { buy: 1.0, sell: 0.6 },
};

// reach      - how near the trader must be (m) for their shelves to be a counter rather than something to steal from
// restock    - a box of theirs holding fewer things than this is stocked again on a new day (the first look after it)
// deedEvery  - seconds between the `trade` deeds a run of deals with one trader records (standing grows by dealing)
// law       - 'delivery' (the loot law, WEB_DEPTH_PLAN §0.2: shelves fill only from deliveries) | 'mint' (the old daily roll)
export const TRADE = { reach: 9, restock: 3, deedEvery: 30, law: 'delivery' };
