// BENCHES as rows (docs/design/WEB_CRAFTING.md §3): where a recipe can be made. A recipe names ONE bench id; the maker
// has it when it is in reach (systems/crafting.js benchesHere):
//   hand       no bench: anywhere, with a tool in the hand (the simple jobs)
//   campfire   a fire burning within `reach` m (a flare, a fire pit, a burning car; the camps lane registers its own)
//   placed     a bench thing you carried and SET DOWN where you are (furniture is only what you found and carried: the
//              item leaves your pack and stands in the world at that spot, and you can pick it up again)
//   mobile     the TOOL ROLL in a car's trunk or your pack: only recipes with `mobile: true` (the small jobs)
//   town       a keeper's bench in a town (sites below): the keeper must be there and awake and not hostile to you;
//              their fee (scrip per game hour of bench time) is paid, or they refuse. Keepers are real people with
//              deeds, so a murdered smith is a smithy nobody can use.
// `item` is the thing that stands as the bench; `kind` how it is had.
export const BENCHES = {
  hand:      { name: 'BY HAND', kind: 'hand', desc: 'no bench: anywhere, with the right tool in your hand' },
  campfire:  { name: 'CAMPFIRE', kind: 'fire', reach: 4, desc: 'a fire burning within four metres' },
  workbench: { name: 'WORKBENCH', kind: 'placed', item: 'workbench', reach: 3.5, desc: 'a heavy table with a vise: carpentry and joining' },
  forge:     { name: 'ANVIL & FORGE', kind: 'placed', item: 'forge_kit', reach: 3.5, desc: 'a coal bed and an anvil: shaping steel' },
  sewing:    { name: 'SEWING TABLE', kind: 'placed', item: 'sewing_table', reach: 3.5, desc: 'a treadle machine: cloth and leather' },
  kitchen:   { name: 'KITCHEN', kind: 'placed', item: 'camp_stove', reach: 3.5, desc: 'a stove and a clean surface: meals' },
  reloading: { name: 'RELOADING BENCH', kind: 'placed', item: 'reload_press', reach: 3.5, desc: 'a press and a scale: loading rounds' },
  chem:      { name: 'CHEM TABLE', kind: 'placed', item: 'chem_set', reach: 3.5, desc: 'flasks and a burner: medicines and fuels' },
  mobile:    { name: 'TOOL ROLL', kind: 'mobile', item: 'tool_roll', desc: 'a roll of small tools in the trunk: simple jobs on the road' },
};

// ---- town benches: a keeper's bench, open while they are -----------------------------------------------------------------
//   bench    the bench id it stands in for; keeper: an NPC id (data/npcs.js); r: how close you must be to the keeper;
//   fee      scrip per game hour of bench time (x the keeper's price for you); needStanding: faction reading to be let in
export const TOWN_BENCHES = {
  kenji_yard: { name: "KENJI'S YARD", bench: ['workbench', 'forge'], keeper: 'kenji', r: 14, fee: 12 },
  ike_counter: { name: "IKE'S BACK ROOM", bench: ['reloading'], keeper: 'ike', r: 10, fee: 15 },
  mags_kitchen: { name: "MAGS'S STOVE", bench: ['kitchen'], keeper: 'mags', r: 10, fee: 6 },
};

// Set-down benches stand where they were put: a `placed` record { bench, item, x, z } in the world and the save. A base lane
// (camps/bases) registers its own through crafting.addProvider((g) => [{ bench, x, z, owner? }]).
export const PLACE_RULES = { minApart: 2.4, maxPerBench: 3 };

export function validateBenches(rows = BENCHES, { items = null, npcs = null, towns = TOWN_BENCHES } = {}) {
  const errors = [], KINDS = ['hand', 'fire', 'placed', 'mobile'];
  for (const [id, b] of Object.entries(rows)) {
    const at = `bench "${id}"`;
    if (!b.name) errors.push(`${at}: no name`);
    if (!KINDS.includes(b.kind)) errors.push(`${at}: kind must be ${KINDS.join('|')}`);
    if ((b.kind === 'placed' || b.kind === 'mobile') && !b.item) errors.push(`${at}: a ${b.kind} bench needs the item that stands as it`);
    if (items && b.item && !items[b.item]) errors.push(`${at}: item ${b.item} is not an item`);
    if (items && b.item && items[b.item] && items[b.item].bench !== id) errors.push(`${at}: item ${b.item} does not name this bench (bench: '${id}')`);
    if (b.kind === 'placed' && !(b.reach > 0)) errors.push(`${at}: reach`);
    if (b.kind === 'fire' && !(b.reach > 0)) errors.push(`${at}: reach`);
  }
  for (const [id, t] of Object.entries(towns)) {
    const at = `town bench "${id}"`;
    for (const b of t.bench ?? []) if (!rows[b]) errors.push(`${at}: bench ${b} unknown`);
    if (!t.keeper) errors.push(`${at}: no keeper`);
    if (npcs && t.keeper && !npcs.includes(t.keeper)) errors.push(`${at}: keeper ${t.keeper} is not an NPC`);
    if (!(t.fee >= 0)) errors.push(`${at}: fee`);
  }
  return { ok: !errors.length, errors, benches: Object.keys(rows).length, towns: Object.keys(towns).length };
}
