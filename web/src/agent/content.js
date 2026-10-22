// Content packs: every JSON file in /content is applied at boot through the agent API.
// Agents add game content by writing data, not code. Schema: see AGENTS.md "Content packs".
//
// {
//   "weapons":  { "<key>": { ...weapon row } },                 -> registerWeapon
//   "vehicles": { "<key>": { "base": "buggy", ...row } },       -> registerVehicle
//   "npcs":     [ { "def": { id,name,start,nodes,... }, "x": 0, "z": 0 } ],  -> registerNpc
//   "spawns":   [ { "kind": "raider", "x": 0, "z": 0, "count": 3 } ],     -> spawn
//   "vehicleSpawns": [ { "type": "rig", "x": 0, "z": 0, "heading": 0 } ], -> spawnVehicle
//   "startingKit": { "cash": 100, "weapon": "smg", "smg": 64 }            -> give
// }

const packs = import.meta.glob('/content/*.json', { eager: true, import: 'default' });

export async function loadContentPacks(api) {
  const report = [];
  for (const [path, pack] of Object.entries(packs)) {
    const errors = [];
    const warnings = [];
    const run = async (cmd, args) => { const r = await api.call(cmd, args); if (!r.ok) errors.push(`${cmd}: ${r.error}`); for (const w of r.warnings ?? []) warnings.push(`${args?.def?.id ?? cmd}: ${w}`); };
    for (const [key, def] of Object.entries(pack.weapons ?? {})) await run('registerWeapon', { key, def });
    for (const [key, def] of Object.entries(pack.vehicles ?? {})) await run('registerVehicle', { key, def });
    for (const n of pack.npcs ?? []) await run('registerNpc', n);
    for (const s of pack.spawns ?? []) await run('spawn', s);
    for (const v of pack.vehicleSpawns ?? []) await run('spawnVehicle', v);
    if (pack.startingKit) await run('give', pack.startingKit);
    report.push({ pack: path.split('/').pop(), errors, warnings });
    if (errors.length) console.warn(`[content] ${path}:`, errors);
  }
  api.g.contentReport = report;
  return report;
}
