// COOKING as rows (docs/design/WEB_FARMING.md §3.5). A recipe turns REAL ingredients into a meal at a fire pit or a stove.
// Shaped {id, inputs, tools, hours, skill, bench, output} so the CRAFTING lane's generic recipe engine can fold them in.
//   inputs   item -> count, taken from your pack (the crew cook: from the crew's pool). Nothing is made without them.
//   tools    tags a carried thing must have ('pot'); bench: 'fire' (a fire pit / camp stove / burning vehicle within reach),
//            'stove' (a held base with a kitchen: burns 1 deadwood a batch) or 'any' (either)
//   hours    game hours the cooking takes   skill: the skill that sets the quality (data/outdoors.js cooking 0-10)
//   output   the meal: { n } of the generated meal items `<id>__<tier>`; food / hp what one portion restores at tier 1
//   keepH    game hours a portion keeps fresh before stale, as for any food
// A meal comes out at a QUALITY q (0-1): q = base + perLevel x cooking level + herbs + freshness - bench; the tier
// (off | poor | good | fine) is the item you hold, so quality survives the pack, a trade and a save. An `off` meal is
// the cooking of something rotten: eating it poisons you.
import { ITEMS } from './items.js';
import { MORALE } from './stats.js';

export const QUALITY = {
  base: 0.42, perLevel: 0.045, herbs: 0.1, fresh: 0.14, staleMul: 0.5, stoveBonus: 0.05, potBonus: 0.03,
  tiers: [['off', 0], ['poor', 0.3], ['good', 0.55], ['fine', 0.8]],
  mul: { off: 0.15, poor: 0.8, good: 1, fine: 1.25 },        // portion size x
  mood: { off: null, poor: null, good: 'meal_good', fine: 'meal_fine' },
  wellFedH: { off: 0, poor: 0, good: 6, fine: 12 },           // game hours of being well fed
  wellFed: { hpPerHour: 0.6 },                                // hp a game hour while well fed
  deadwoodPerBatch: 1,
};
MORALE.mods.meal_good ??= { v: 6, hours: 12, label: 'A hot meal' };
MORALE.mods.meal_fine ??= { v: 11, hours: 18, label: 'A proper supper' };

export const RECIPES = [
  { id: 'boiled_potatoes', name: 'Boiled potatoes', inputs: { potato: 3 }, tools: ['pot'], hours: 0.6, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.2, hp: 2, keepH: 60, desc: 'Potatoes, a pot, a pinch of salt. Plain and filling.' },
  { id: 'hash', name: 'Pepper hash', inputs: { potato: 2, pepper: 1 }, tools: [], hours: 0.5, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.24, hp: 3, keepH: 40, desc: 'Diced potato fried hard with pepper. The pan is whatever you have.' },
  { id: 'bean_pot', name: 'Bean pot', inputs: { bean_pods: 3, herbs: 1 }, tools: ['pot'], hours: 0.8, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.24, hp: 3, keepH: 50, desc: 'Green beans stewed down with herbs. Better the second day.' },
  { id: 'roast_squash', name: 'Roast squash', inputs: { squash: 2 }, tools: [], hours: 0.7, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.22, hp: 2, keepH: 48, desc: 'Halved, flat side down on the coals.' },
  { id: 'veg_stew', name: 'Garden stew', inputs: { potato: 1, tomato: 2, greens: 1, herbs: 1 }, tools: ['pot'], hours: 1, skill: 'cooking', bench: 'any', output: { n: 3 }, food: 0.3, hp: 5, keepH: 60, desc: 'Everything from the beds in one pot. It tastes like a house.' },
  { id: 'tomato_soup', name: 'Tomato soup', inputs: { tomato: 3, herbs: 1 }, tools: ['pot'], hours: 0.8, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.2, hp: 3, keepH: 50, desc: 'Tomatoes cooked down thin with a leaf of basil.' },
  { id: 'roast_corn', name: 'Roast corn', inputs: { corn_ear: 2 }, tools: [], hours: 0.4, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.2, hp: 2, keepH: 40, desc: 'In the husk, in the coals, till the husk chars.' },
  { id: 'cornbread', name: 'Cornbread', inputs: { corn_ear: 3, egg: 1 }, tools: [], hours: 1.2, skill: 'cooking', bench: 'stove', output: { n: 3 }, food: 0.26, hp: 3, keepH: 72, desc: 'Cut kernels, an egg, a hot iron pan in a real oven.' },
  { id: 'scramble', name: 'Pepper scramble', inputs: { egg: 3, pepper: 1 }, tools: [], hours: 0.4, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.26, hp: 4, keepH: 20, desc: 'Eggs and pepper, quick, hot, and gone.' },
  { id: 'greens_pan', name: 'Greens and onion', inputs: { greens: 3, wild_onion: 1 }, tools: [], hours: 0.5, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.18, hp: 4, keepH: 30, desc: 'Collards wilted down with wild onion.' },
  { id: 'chili', name: 'Pepper chili', inputs: { pepper: 3, bean_pods: 2, tomato: 2 }, tools: ['pot'], hours: 1.2, skill: 'cooking', bench: 'any', output: { n: 3 }, food: 0.32, hp: 5, keepH: 72, desc: 'Hot enough to warm a cold night.' },
  { id: 'roast_hen', name: 'Roast hen', inputs: { raw_fowl: 1, herbs: 1, potato: 1 }, tools: [], hours: 1.5, skill: 'cooking', bench: 'any', output: { n: 2 }, food: 0.36, hp: 8, keepH: 48, desc: 'A hen of your own, roasted with the bed\'s herbs. A Sunday dinner.' },
];
export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));
export const TIERS = QUALITY.tiers.map(([t]) => t);

// The meal items: every recipe at every tier, generated, so quality is part of the item id.
for (const r of RECIPES) {
  for (const t of TIERS) {
    const m = QUALITY.mul[t], id = `${r.id}__${t}`;
    if (ITEMS[id]) continue;
    ITEMS[id] = {
      name: `${r.name}${t === 'good' ? '' : ` (${t === 'off' ? 'off' : t})`}`, kind: 'food', kg: 0.35, bulk: 0.35, stack: 6, value: Math.round((r.food * 40 + 2) * (t === 'fine' ? 1.5 : t === 'off' ? 0.2 : 1)), spoils: r.keepH,
      use: { need: 'food', amount: +(r.food * m).toFixed(3), hp: Math.round((r.hp ?? 0) * m) }, dog: { bond: 6, hp: 14 }, meal: { recipe: r.id, tier: t }, tags: ['meal'],
      desc: t === 'off' ? `${r.desc} Somebody cooked this from food that was already turning. It smells wrong.` : r.desc,
    };
  }
}

export function validateCooking(recipes = RECIPES, items = ITEMS) {
  const bad = [], ids = new Set();
  for (const r of recipes) {
    const at = `recipe ${r.id}`;
    if (ids.has(r.id)) bad.push(`${at}: duplicate`); ids.add(r.id);
    if (!Object.keys(r.inputs ?? {}).length) bad.push(`${at}: a recipe needs ingredients (nothing is made from nothing)`);
    for (const [k, n] of Object.entries(r.inputs ?? {})) { if (!items[k]) bad.push(`${at}: input ${k} is not an item`); if (!(n >= 1)) bad.push(`${at}: count of ${k}`); }
    for (const t of r.tools ?? []) if (!Object.values(items).some((it) => it.tags?.includes(t))) bad.push(`${at}: no item carries tool tag ${t}`);
    if (!['fire', 'stove', 'any'].includes(r.bench)) bad.push(`${at}: bench fire|stove|any`);
    if (!(r.hours > 0)) bad.push(`${at}: hours`);
    if (!(r.output?.n >= 1)) bad.push(`${at}: output.n`);
    if (!(r.food > 0)) bad.push(`${at}: food`);
    if (!(r.keepH > 0)) bad.push(`${at}: keepH`);
    // A recipe never makes more food than its ingredients hold (no meal out of nothing).
    const inFood = Object.entries(r.inputs ?? {}).reduce((s, [k, n]) => s + (items[k]?.use?.amount ?? 0.05) * n, 0);
    const outFood = r.food * (r.output?.n ?? 1);
    if (items[Object.keys(r.inputs)[0]] && outFood > inFood * 3 + 0.3) bad.push(`${at}: makes ${outFood.toFixed(2)} food from ${inFood.toFixed(2)}`);
    for (const t of TIERS) if (!items[`${r.id}__${t}`]) bad.push(`${at}: meal item ${t} missing`);
  }
  for (const [t, v] of Object.entries(QUALITY.mul)) if (!(v > 0)) bad.push(`quality mul ${t}`);
  return { ok: !bad.length, bad, recipes: recipes.length };
}
