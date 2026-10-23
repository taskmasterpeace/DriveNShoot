// Who trades, in what, and what standing does to a price (docs/design/WEB_TRADE.md). A trader's stock is the
// shelves and crates of their own shop; with them at the counter, taking is buying and putting is selling.

// By named person (data/npcs.js id): what they will buy from you (item kinds or ids) and the name the PACK screen
// calls them by. They sell whatever is on their shelves.
export const TRADERS = {
  ike: { name: 'Ike', deals: ['gun', 'ammo', 'tool'] },
  reyes: { name: 'Doc Reyes', deals: ['med'] },
  kenji: { name: 'Kenji', deals: ['part', 'tool', 'pack'] },
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
export const TRADE = { reach: 9, restock: 3, deedEvery: 30 };
