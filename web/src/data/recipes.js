// RECIPES as rows (docs/design/WEB_CRAFTING.md): ONE general engine, so every maker item is a row, not a system
// (depth-plan law 7). systems/crafting.js runs them; agent/crafting-api.js is the COMMANDS share; the World Forge calls
// validateRecipes(). Our own names and our own words.
//   id, name, group   the row and how the CRAFT tab files it (GROUPS)
//   inputs            [[item, n]] taken from your pack, then the trunk of the car you are at: consumed, all of it, up front
//   tools             [[tag-or-item, wear]] carried tools (a tag, or 'a|b' for either); each loses `wear` condition per
//                     make, and a tool at 0 breaks and is gone. A tool in the hand is a tool you CARRY
//   hours             game hours at skill 0 (skill shortens it: CRAFT_RULES.speed); a progress bar on the game clock
//   skill, minSkill   the deep-sheet skill (data/stats.js) and the least level to try it (0..100)
//   bench             a bench id (data/benches.js); `mobile: true` lets the tool roll in a trunk stand in for it
//   outputs           [[item, n]] made; a durable output (`dur`) comes out at a condition the skill allows
//   byproducts        [[item, n]] left over, real things: offcuts, scrap, rags
//   effect            instead of making things: ['mend', tag, amount] restores condition of a carried tool with that tag,
//                     ['mendgear', amount] the gear you wear, ['sharpen', tag, amount] an edge. No outputs
//   noise             metres the work is heard from (hammering carries); 0 = quiet
//   learnedFrom       'default' | 'skill' (known the moment you have minSkill) | 'perk:<skill>:<tier>' | 'book:<item>'
//   xp                skill xp for one make (scaled by hours)
// THE MATTER RULE (validateRecipes): outputs + byproducts never weigh more than the inputs; a recipe cannot create stock.
export const CRAFT_RULES = {
  qMin: 0.45,        // the worst condition a made durable can come out at (skill = minSkill, no bench)
  qSpan: 60,         // skill points above minSkill that take it to 1.0
  qBench: 0.05,      // a bench of its own kind adds this
  qTool: 0.1,        // a worn tool takes up to this off the result (x its missing condition)
  speed: 0.4,        // at skill 100 the work takes (1 - speed) of its hours
  xpHours: 0.2,      // xp x (1 + hours x this)
  slack: 0.02,       // kg the matter rule forgives in rounding
  townPerHour: 1,    // x the keeper's fee per bench hour
  queueMax: 6,
};

export const GROUPS = {
  cloth: 'CLOTH & ROPE', medical: 'MEDICAL', wood: 'WOOD', metal: 'METAL', tools: 'TOOLS', ammo: 'LOADING',
  light: 'LIGHT & FIRE', trap: 'TRAPS & BOWS', repair: 'REPAIR & EDGE', meals: 'MEALS',
};

const R = (id, name, group, r) => ({ id, name, group, tools: [], hours: 1, skill: 'fabrication', minSkill: 0, bench: 'hand', byproducts: [], noise: 0, learnedFrom: 'default', xp: 3, ...r });

export const RECIPES = [
  // ---- cloth & rope: by hand, the first things anyone makes ----------------------------------------------------------
  R('make_rag', 'Tear rags', 'cloth', { inputs: [['cloth_scrap', 1]], tools: [['blade', 0.004]], hours: 0.1, outputs: [['rag', 3]], xp: 1 }),
  R('make_cord', 'Twist cord', 'cloth', { inputs: [['plant_fibre', 1]], hours: 0.1, outputs: [['cord', 1]], xp: 1 }),
  R('make_rope', 'Twist rope', 'cloth', { inputs: [['plant_fibre', 12]], hours: 1.5, minSkill: 5, outputs: [['rope', 1]], xp: 4 }),
  R('rope_from_cloth', 'Rope from cloth strips', 'cloth', { inputs: [['cloth_scrap', 4]], tools: [['blade', 0.005]], hours: 1, minSkill: 8, outputs: [['rope', 1]], xp: 4 }),
  R('bowstring', 'Wax a bowstring', 'cloth', { inputs: [['cord', 3]], hours: 0.4, minSkill: 15, outputs: [['bowstring', 3]], xp: 2, learnedFrom: 'skill' }),
  R('make_duct_tape', 'Cloth-and-tallow tape', 'cloth', { inputs: [['cloth_scrap', 2], ['tallow', 1]], hours: 0.5, minSkill: 10, outputs: [['duct_tape', 1]], xp: 3, learnedFrom: 'skill' }),
  R('stitch_satchel', 'Stitch a satchel', 'cloth', { inputs: [['cloth_scrap', 4], ['cord', 2]], tools: [['needle', 0.04]], hours: 2.5, minSkill: 15, bench: 'sewing', outputs: [['satchel', 1]], xp: 8, learnedFrom: 'skill' }),
  R('stitch_backpack', 'Stitch a backpack', 'cloth', { inputs: [['cloth_scrap', 8], ['cord', 4], ['nails', 20]], tools: [['needle', 0.08]], hours: 5, minSkill: 35, bench: 'sewing', outputs: [['backpack', 1]], xp: 14, learnedFrom: 'skill' }),
  R('make_repair_kit', 'Pack a repair kit', 'cloth', { inputs: [['cloth_scrap', 2], ['nails', 20], ['cord', 2], ['tallow', 1]], tools: [['needle', 0.03]], hours: 1.5, minSkill: 20, bench: 'sewing', outputs: [['repair_kit', 1]], xp: 6, learnedFrom: 'skill' }),
  // ---- medical: what a medic makes from nothing ---------------------------------------------------------------------
  R('make_bandage', 'Boil a bandage', 'medical', { inputs: [['cloth_scrap', 2]], hours: 0.5, skill: 'firstaid', minSkill: 8, bench: 'campfire', outputs: [['bandage', 4]], xp: 4, learnedFrom: 'skill' }),
  R('layer_dressing', 'Layer a dressing', 'medical', { inputs: [['rag', 2]], hours: 0.25, skill: 'firstaid', minSkill: 5, bench: 'campfire', outputs: [['bandage', 1]], xp: 2 }),
  R('make_splint', 'Cut a splint', 'medical', { inputs: [['wood_scrap', 1], ['cord', 2]], tools: [['saw|blade|axe', 0.01]], hours: 0.5, skill: 'firstaid', minSkill: 10, outputs: [['splint', 4]], xp: 4, learnedFrom: 'skill', noise: 6 }),
  R('herbal_poultice', 'Bind a poultice', 'medical', { inputs: [['herbs', 3], ['cloth_scrap', 1]], hours: 0.5, skill: 'firstaid', minSkill: 20, outputs: [['poultice', 1]], xp: 5, learnedFrom: 'book:manual_field_medicine' }),
  R('boil_dressing', 'Boil sterile dressings', 'medical', { inputs: [['cloth_scrap', 3], ['herbs', 1]], hours: 0.75, skill: 'firstaid', minSkill: 25, bench: 'campfire', outputs: [['bandage', 6]], xp: 5, learnedFrom: 'book:manual_field_medicine' }),
  R('steep_tincture', 'Steep a tincture', 'medical', { inputs: [['herbs', 4]], hours: 1, skill: 'chemistry', minSkill: 15, bench: 'chem', outputs: [['tincture', 1]], xp: 6, learnedFrom: 'skill' }),
  // ---- wood -----------------------------------------------------------------------------------------------------------
  R('make_planks', 'Rip planks', 'wood', { inputs: [['wood_scrap', 3], ['nails', 6]], tools: [['saw', 0.02], ['hammer', 0.01]], hours: 1, skill: 'carpentry', bench: 'workbench', outputs: [['planks', 1]], xp: 4, noise: 22 }),
  R('break_planks', 'Break planks down', 'wood', { inputs: [['planks', 1]], tools: [['axe|saw|crowbar', 0.01]], hours: 0.25, skill: 'salvage', outputs: [['wood_scrap', 3]], xp: 1, noise: 20 }),
  R('plank_barricade', 'Build a plank barricade', 'wood', { inputs: [['planks', 1], ['wood_scrap', 1], ['nails', 30]], tools: [['hammer', 0.02]], hours: 1.5, skill: 'carpentry', minSkill: 12, bench: 'workbench', outputs: [['plank_barricade', 1]], xp: 7, noise: 26, mobile: true, learnedFrom: 'skill' }),
  R('whittle_spear', 'Lash a spear', 'wood', { inputs: [['wood_scrap', 1], ['scrap', 1], ['cord', 2]], tools: [['blade', 0.02]], hours: 1.2, skill: 'carpentry', minSkill: 8, outputs: [['spear', 1]], xp: 5, learnedFrom: 'skill' }),
  R('bow_stave', 'Shape a bow stave', 'wood', { inputs: [['wood_scrap', 1]], tools: [['blade', 0.02], ['saw', 0.01]], hours: 3, skill: 'carpentry', minSkill: 30, bench: 'workbench', outputs: [['bow_stave', 1]], xp: 10, learnedFrom: 'skill' }),
  R('arrow_shafts', 'Straighten arrow shafts', 'wood', { inputs: [['wood_scrap', 1], ['cloth_scrap', 1]], tools: [['blade', 0.02]], hours: 2, skill: 'carpentry', minSkill: 25, outputs: [['arrow_shaft', 10]], byproducts: [['rag', 1]], xp: 8, learnedFrom: 'skill' }),
  R('make_hand_saw', 'Set a hand saw', 'wood', { inputs: [['scrap', 1], ['wood_scrap', 1]], tools: [['file', 0.05]], hours: 2, skill: 'carpentry', minSkill: 10, bench: 'workbench', outputs: [['hand_saw', 1]], xp: 6, learnedFrom: 'skill' }),
  // ---- metal: the anvil and forge, mechanics -----------------------------------------------------------------------
  R('forge_nails', 'Draw nails', 'metal', { inputs: [['scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.02]], hours: 1, skill: 'mechanics', minSkill: 5, bench: 'forge', outputs: [['nails', 100]], xp: 3, noise: 30 }),
  R('forge_hammer', 'Forge a hammer', 'tools', { inputs: [['scrap', 1], ['wood_scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.03]], hours: 2, skill: 'mechanics', minSkill: 5, bench: 'forge', outputs: [['hammer', 1]], xp: 6, noise: 32 }),
  R('forge_file', 'Forge a file', 'tools', { inputs: [['scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.03]], hours: 2, skill: 'mechanics', minSkill: 12, bench: 'forge', outputs: [['metal_file', 1]], xp: 6, noise: 32, learnedFrom: 'skill' }),
  R('forge_pliers', 'Forge pliers', 'tools', { inputs: [['scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.03], ['file', 0.02]], hours: 2.5, skill: 'mechanics', minSkill: 20, bench: 'forge', outputs: [['pliers', 1]], xp: 8, noise: 32, learnedFrom: 'skill' }),
  R('grind_whetstone', 'Dress a whetstone', 'tools', { inputs: [['scrap', 1]], tools: [['file', 0.03]], hours: 1, skill: 'mechanics', minSkill: 8, outputs: [['whetstone', 1]], xp: 3, learnedFrom: 'skill' }),
  R('forge_blade', 'Forge a knife', 'metal', { inputs: [['scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.03], ['file', 0.02]], hours: 2, skill: 'mechanics', minSkill: 15, bench: 'forge', outputs: [['knife', 1]], byproducts: [['nails', 20]], xp: 7, noise: 32, learnedFrom: 'book:manual_smith' }),
  R('forge_hatchet', 'Forge a hatchet', 'tools', { inputs: [['scrap', 1], ['wood_scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.04], ['file', 0.02]], hours: 3, skill: 'mechanics', minSkill: 20, bench: 'forge', outputs: [['hatchet', 1]], byproducts: [['scrap', 1]], xp: 10, noise: 34, learnedFrom: 'book:manual_smith' }),
  R('forge_machete', 'Forge a machete', 'tools', { inputs: [['scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.04], ['file', 0.03]], hours: 3, skill: 'mechanics', minSkill: 30, bench: 'forge', outputs: [['machete', 1]], xp: 10, noise: 34, learnedFrom: 'skill' }),
  R('forge_wrench', 'Forge a wrench', 'tools', { inputs: [['scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.04], ['file', 0.03]], hours: 2.5, skill: 'mechanics', minSkill: 25, bench: 'forge', outputs: [['wrench', 1]], xp: 8, noise: 32, learnedFrom: 'skill' }),
  R('forge_crowbar', 'Forge a crowbar', 'tools', { inputs: [['scrap', 2], ['charcoal', 1]], tools: [['hammer', 0.04]], hours: 3, skill: 'mechanics', minSkill: 30, bench: 'forge', outputs: [['crowbar', 1]], xp: 9, noise: 34, learnedFrom: 'skill' }),
  R('forge_barricade', 'Rivet a plate barricade', 'metal', { inputs: [['scrap', 4], ['charcoal', 1]], tools: [['hammer', 0.04], ['pliers', 0.02]], hours: 4, skill: 'mechanics', minSkill: 22, bench: 'forge', outputs: [['metal_barricade', 1]], xp: 12, noise: 36, learnedFrom: 'book:manual_smith' }),
  R('forge_snare_wire', 'Draw snare wire', 'trap', { inputs: [['scrap', 1], ['charcoal', 1]], tools: [['hammer', 0.02], ['pliers', 0.02]], hours: 1.5, skill: 'mechanics', minSkill: 10, bench: 'forge', outputs: [['snare_wire', 6]], xp: 4, noise: 30, learnedFrom: 'skill' }),
  R('forge_fish_hooks', 'File fish hooks', 'trap', { inputs: [['scrap', 1]], tools: [['file', 0.02], ['pliers', 0.01]], hours: 1, skill: 'mechanics', minSkill: 12, outputs: [['fish_hook', 40]], xp: 3, learnedFrom: 'skill' }),
  R('pick_lockpicks', 'File a set of picks', 'tools', { inputs: [['scrap', 1]], tools: [['file', 0.05]], hours: 2, skill: 'mechanics', minSkill: 35, outputs: [['lockpicks', 1]], xp: 9, learnedFrom: 'skill' }),
  // ---- traps ----------------------------------------------------------------------------------------------------------
  R('cut_triggers', 'Whittle trap triggers', 'trap', { inputs: [['wood_scrap', 1], ['snare_wire', 1]], tools: [['blade', 0.02]], hours: 0.75, skill: 'hunting', minSkill: 5, outputs: [['trap_trigger', 6]], xp: 3 }),
  // ---- light & fire -----------------------------------------------------------------------------------------------------
  R('make_charcoal', 'Burn charcoal', 'light', { inputs: [['wood_scrap', 1]], hours: 3, skill: 'fabrication', minSkill: 3, bench: 'campfire', outputs: [['charcoal', 2]], xp: 3 }),
  R('dip_candles', 'Dip candles', 'light', { inputs: [['tallow', 1], ['cord', 1]], hours: 0.5, minSkill: 3, bench: 'campfire', outputs: [['candle', 2]], xp: 2 }),
  R('wrap_torches', 'Wrap torches', 'light', { inputs: [['wood_scrap', 1], ['cloth_scrap', 1], ['tallow', 1]], tools: [['blade', 0.01]], hours: 0.5, outputs: [['torch', 4]], xp: 2 }),
  R('render_oil', 'Render lamp oil', 'light', { inputs: [['tallow', 2]], hours: 1.5, skill: 'chemistry', minSkill: 10, bench: 'chem', outputs: [['oil_flask', 1]], xp: 4, learnedFrom: 'skill' }),
  R('make_oil_lamp', 'Build an oil lamp', 'light', { inputs: [['scrap', 1], ['cloth_scrap', 1], ['oil_flask', 1]], tools: [['pliers', 0.02]], hours: 1.5, skill: 'mechanics', minSkill: 12, bench: 'workbench', outputs: [['oil_lamp', 1]], xp: 5, learnedFrom: 'skill' }),
  // ---- repair & edge: nothing is made, something is mended -------------------------------------------------------------
  R('sharpen_blade', 'Sharpen a blade', 'repair', { inputs: [], tools: [['stone', 0.04]], hours: 0.3, skill: 'mechanics', outputs: [], effect: ['sharpen', 'blade', 0.35], xp: 2, mobile: true }),
  R('file_edge', 'File an edge true', 'repair', { inputs: [], tools: [['file', 0.03]], hours: 0.4, skill: 'mechanics', minSkill: 10, outputs: [], effect: ['sharpen', 'blade', 0.25], xp: 2, mobile: true, learnedFrom: 'skill' }),
  R('rehaft_tool', 'Re-haft a tool', 'repair', { inputs: [['wood_scrap', 1], ['nails', 4]], tools: [['hammer', 0.02], ['saw|blade', 0.01]], hours: 0.8, skill: 'carpentry', minSkill: 5, bench: 'workbench', outputs: [], effect: ['mend', 'steel', 0.4], xp: 3, noise: 20 }),
  R('patch_tool', 'Straighten and patch a tool', 'repair', { inputs: [['scrap', 1]], tools: [['hammer', 0.02]], hours: 0.8, skill: 'mechanics', minSkill: 8, bench: 'forge', outputs: [], byproducts: [['nails', 40]], effect: ['mend', 'steel', 0.5], xp: 4, noise: 30 }),
  R('patch_gear', 'Patch what you wear', 'repair', { inputs: [['cloth_scrap', 1]], tools: [['needle', 0.05]], hours: 0.75, skill: 'fabrication', outputs: [], effect: ['mendgear', 0.2], xp: 3, mobile: true }),
  R('restitch_gear', 'Stitch it properly', 'repair', { inputs: [['cloth_scrap', 2], ['cord', 1]], tools: [['needle', 0.08]], hours: 2, skill: 'fabrication', minSkill: 20, bench: 'sewing', outputs: [], effect: ['mendgear', 0.5], xp: 6, learnedFrom: 'skill' }),
  R('make_cleaning_kit', 'Make a gun cleaning kit', 'repair', { inputs: [['cloth_scrap', 1], ['tallow', 1], ['nails', 10]], tools: [['file', 0.02]], hours: 1, skill: 'mechanics', minSkill: 10, outputs: [['cleaning_kit', 1]], xp: 5, learnedFrom: 'skill' }),
  // ---- loading: brass, powder, primer, lead; the reloading bench --------------------------------------------------------
  R('load_pistol', 'Load pistol rounds', 'ammo', { inputs: [['brass_case', 8], ['lead_shot', 1], ['gunpowder', 1], ['primer', 8]], hours: 0.5, skill: 'mechanics', minSkill: 10, bench: 'reloading', outputs: [['ammo_pistol', 8]], xp: 4, noise: 4, learnedFrom: 'skill' }),
  R('load_smg', 'Load SMG rounds', 'ammo', { inputs: [['brass_case', 10], ['lead_shot', 1], ['gunpowder', 1], ['primer', 10]], hours: 0.6, skill: 'mechanics', minSkill: 15, bench: 'reloading', outputs: [['ammo_smg', 10]], xp: 4, noise: 4, learnedFrom: 'skill' }),
  R('load_rifle', 'Load rifle rounds', 'ammo', { inputs: [['brass_case', 5], ['lead_shot', 1], ['gunpowder', 1], ['primer', 5]], hours: 0.8, skill: 'mechanics', minSkill: 30, bench: 'reloading', outputs: [['ammo_rifle', 5]], xp: 6, noise: 4, learnedFrom: 'book:manual_gunsmith' }),
  R('load_shells', 'Load shotgun shells', 'ammo', { inputs: [['brass_case', 4], ['lead_shot', 3], ['gunpowder', 1], ['primer', 4]], hours: 0.8, skill: 'mechanics', minSkill: 20, bench: 'reloading', outputs: [['ammo_shells', 4]], xp: 5, noise: 4, learnedFrom: 'book:manual_gunsmith' }),
  R('load_22lr', 'Load .22 rounds', 'ammo', { inputs: [['brass_case', 20], ['lead_shot', 1], ['gunpowder', 1], ['primer', 20]], hours: 0.7, skill: 'mechanics', minSkill: 8, bench: 'reloading', outputs: [['ammo_22lr', 20]], xp: 3, noise: 4, learnedFrom: 'skill' }),
  R('load_357', 'Load .357 rounds', 'ammo', { inputs: [['brass_case', 6], ['lead_shot', 1], ['gunpowder', 1], ['primer', 6]], hours: 0.5, skill: 'mechanics', minSkill: 22, bench: 'reloading', outputs: [['ammo_357mag', 6]], xp: 5, noise: 4, learnedFrom: 'book:manual_gunsmith' }),
  R('load_slugs', 'Load slug shells', 'ammo', { inputs: [['brass_case', 4], ['lead_shot', 3], ['gunpowder', 1], ['primer', 4]], hours: 0.8, skill: 'mechanics', minSkill: 24, bench: 'reloading', outputs: [['ammo_slug', 4]], xp: 5, noise: 4, learnedFrom: 'book:manual_gunsmith' }),
  R('cast_shot', 'Cast lead', 'ammo', { inputs: [['lead_pipe', 1]], hours: 1, skill: 'mechanics', minSkill: 15, bench: 'campfire', outputs: [['lead_shot', 10]], xp: 4, learnedFrom: 'book:manual_gunsmith' }),
  // ---- more hands-on work: salvage, sewing, the small kit of a road --------------------------------------------------------------
  R('strip_rope_cord', 'Unlay rope to cord', 'cloth', { inputs: [['rope', 1]], tools: [['blade', 0.004]], hours: 0.3, minSkill: 3, outputs: [['cord', 12]], xp: 1 }),
  R('stitch_pouch_cord', 'Braid heavy cord', 'cloth', { inputs: [['plant_fibre', 4], ['tallow', 1]], hours: 0.5, minSkill: 6, outputs: [['cord', 4]], xp: 2 }),
  R('grind_herbs', 'Dry and bundle herbs', 'medical', { inputs: [['plant_fibre', 2], ['cloth_scrap', 1]], hours: 0.5, skill: 'firstaid', minSkill: 6, outputs: [['herbs', 3]], xp: 2 }),
  R('hew_planks_hatchet', 'Hew planks with a hatchet', 'wood', { inputs: [['wood_scrap', 3]], tools: [['axe', 0.03]], hours: 1.5, skill: 'carpentry', minSkill: 4, outputs: [['planks', 1]], xp: 3, noise: 24, mobile: true }),
  R('carve_trigger_pegs', 'Carve pegs and wedges', 'wood', { inputs: [['wood_scrap', 1]], tools: [['blade', 0.02]], hours: 0.5, skill: 'carpentry', outputs: [['trap_trigger', 8]], xp: 2 }),
  R('reclaim_spike_nails', 'Pound a rail spike into nails', 'metal', { inputs: [['scrap', 1]], tools: [['hammer', 0.02]], hours: 1, skill: 'mechanics', minSkill: 3, bench: 'forge', outputs: [['nails', 120]], xp: 2, noise: 30 }),
  R('boil_candle_oil', 'Skim lamp oil from tallow', 'light', { inputs: [['tallow', 2]], hours: 1.2, skill: 'cooking', minSkill: 6, bench: 'kitchen', outputs: [['oil_flask', 1]], xp: 3, learnedFrom: 'skill' }),
  R('twist_fuse_cord', 'Wick a lamp', 'light', { inputs: [['cord', 2], ['tallow', 1]], hours: 0.3, minSkill: 4, outputs: [['candle', 2]], xp: 1 }),
  // ---- meals: the road's cooking; the farming lane fills this group with its own ---------------------------------------
  R('camp_stew', 'Simmer a camp stew', 'meals', { inputs: [['beans_tin', 2], ['jerky', 1]], tools: [['blade', 0.003]], hours: 0.5, skill: 'cooking', minSkill: 5, bench: 'campfire', outputs: [['camp_stew', 1]], xp: 4 }),
  R('bake_hardtack', 'Bake hardtack', 'meals', { inputs: [['flatbread', 3]], hours: 1, skill: 'cooking', minSkill: 10, bench: 'kitchen', outputs: [['hardtack', 3]], xp: 4, learnedFrom: 'skill' }),
  R('boil_cactus_jam', 'Boil cactus jam', 'meals', { inputs: [['cactus_fruit', 6]], hours: 1, skill: 'cooking', minSkill: 8, bench: 'kitchen', outputs: [['cactus_jam', 1]], xp: 4, learnedFrom: 'skill' }),
];

export const RECIPE_BY_ID = Object.fromEntries(RECIPES.map((r) => [r.id, r]));

// ---- the matter rule: no recipe makes more kilograms than it eats -----------------------------------------------------------
const kgOf = (items, list) => list.reduce((a, [id, n]) => a + (items[id]?.kg ?? 0) * n, 0);
export function matterOf(r, items) {
  const inKg = kgOf(items, r.inputs), outKg = kgOf(items, r.outputs ?? []) + kgOf(items, r.byproducts ?? []);
  return { inKg: +inKg.toFixed(4), outKg: +outKg.toFixed(4), net: +(outKg - inKg).toFixed(4) };
}

const LEARN = /^(default|skill|perk:[a-z]+:[1-4]|book:[a-z_0-9]+)$/;

// items: the ITEMS table; skills: the deep sheet's skill ids; benches: BENCHES; perks: PERKS (for perk:<skill>:<tier>)
export function validateRecipes(rows = RECIPES, { items = null, skills = null, benches = null, slack = CRAFT_RULES.slack } = {}) {
  const errors = [], warnings = [], ids = new Set();
  const pairs = (r, key, at) => {
    for (const p of r[key] ?? []) {
      if (!Array.isArray(p) || typeof p[0] !== 'string' || !(p[1] > 0) || !Number.isInteger(p[1])) errors.push(`${at}: ${key} entry ${JSON.stringify(p)} must be [item, whole n > 0]`);
      else if (items && !items[p[0]]) errors.push(`${at}: ${key} item ${p[0]} is not an item`);
    }
  };
  for (const r of rows) {
    const at = `recipe "${r.id}"`;
    if (!r.id || ids.has(r.id)) errors.push(`${at}: missing or duplicate id`); ids.add(r.id);
    if (!r.name) errors.push(`${at}: no name`);
    if (!GROUPS[r.group]) errors.push(`${at}: group ${r.group} unknown`);
    if (!Array.isArray(r.inputs)) errors.push(`${at}: inputs must be a list`);
    pairs(r, 'inputs', at); pairs(r, 'outputs', at); pairs(r, 'byproducts', at);
    if (!(r.hours > 0)) errors.push(`${at}: hours must be > 0 (time passes)`);
    if (!(r.minSkill >= 0 && r.minSkill <= 100)) errors.push(`${at}: minSkill 0..100`);
    if (skills && !skills.includes(r.skill)) errors.push(`${at}: skill ${r.skill} unknown`);
    if (benches && !benches[r.bench]) errors.push(`${at}: bench ${r.bench} unknown`);
    if (r.mobile && r.bench !== 'hand' && benches && benches[r.bench]?.kind !== 'mobile') {/* a mobile recipe with a real bench is the tool-roll's allowance */}
    if (!LEARN.test(r.learnedFrom ?? '')) errors.push(`${at}: learnedFrom must be default|skill|perk:<skill>:<tier>|book:<item>`);
    if (items && String(r.learnedFrom).startsWith('book:') && !items[r.learnedFrom.slice(5)]) errors.push(`${at}: book ${r.learnedFrom.slice(5)} is not an item`);
    if (items && String(r.learnedFrom).startsWith('book:') && !(items[r.learnedFrom.slice(5)]?.learns ?? []).includes(r.id)) errors.push(`${at}: the book ${r.learnedFrom.slice(5)} does not teach it (its learns list)`);
    for (const t of r.tools ?? []) {
      if (!Array.isArray(t) || typeof t[0] !== 'string' || !(t[1] >= 0 && t[1] <= 0.5)) errors.push(`${at}: tool ${JSON.stringify(t)} must be [tag-or-item, wear 0..0.5]`);
      else if (items) for (const alt of t[0].split('|')) if (!Object.values(items).some((it) => it.tags?.includes(alt)) && !items[alt]) errors.push(`${at}: tool ${alt} is neither a tag nor an item anything carries`);
    }
    if (!(r.noise >= 0)) errors.push(`${at}: noise`);
    if (r.effect) {
      const [k, a, b] = r.effect, ok = (k === 'mendgear' && a > 0 && a <= 1) || ((k === 'mend' || k === 'sharpen') && typeof a === 'string' && b > 0 && b <= 1);
      if (!ok) errors.push(`${at}: effect must be ['mendgear', amt] | ['mend'|'sharpen', tag, amt]`);
      if ((r.outputs ?? []).length) errors.push(`${at}: an effect recipe makes nothing (outputs must be empty)`);
    } else if (!(r.outputs ?? []).length) errors.push(`${at}: makes nothing: give it outputs or an effect`);
    if (items && !r.effect && Array.isArray(r.inputs) && Array.isArray(r.outputs)) {
      if (!r.inputs.length) errors.push(`${at}: makes things from no inputs (matter from nothing)`);
      const m = matterOf(r, items);
      if (m.net > slack + 1e-9) errors.push(`${at}: MATTER: makes ${m.outKg} kg from ${m.inKg} kg (+${m.net})`);
      for (const [o] of r.outputs) if (r.inputs.some(([i]) => i === o)) warnings.push(`${at}: ${o} is both an input and an output`);
    }
  }
  return { ok: !errors.length, errors, warnings, recipes: rows.length };
}

// A manual's `learns` list must name real recipes that name it back.
export function validateManuals(items, rows = RECIPES) {
  const errors = [];
  for (const [id, it] of Object.entries(items)) for (const rid of it.learns ?? []) {
    const r = rows.find((x) => x.id === rid);
    if (!r) errors.push(`manual ${id}: teaches ${rid}, which is no recipe`);
    else if (r.learnedFrom !== `book:${id}`) errors.push(`manual ${id}: ${rid} says it is learned from ${r.learnedFrom}`);
  }
  return { ok: !errors.length, errors };
}
