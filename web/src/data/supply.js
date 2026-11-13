// THE SUPPLY LAW as rows (docs/design/WEB_SUPPLY_LAW.md; WEB_DEPTH_PLAN law 2: no loot regeneration; G0(d): the stock
// ledger and the cheat audit). Nothing a crew job makes comes from nowhere:
//   - TEND THE GARDEN works the farming lane's real beds (systems/farming.js crewTend: seed, water and days)
//   - CRAFT AMMO runs the crafting lane's load_pistol row (systems/crafting.js crewRun: brass, powder, primer, lead)
//   - a SCAVENGE RUN opens real unopened containers near the base, rolled once like any box; those houses stay empty
//     (this file: the run's rows)

// ---- the scavenge run (data/crewjobs.js scav_run; systems/crew.js startRun / tickRuns) -------------------------------
//   reach     metres from the base a runner will go (x the skill multiplier)
//   boxes     unopened containers a run opens at most (nearest first: the town round the base is stripped outward)
//   carry     litres a runner brings home; the rest stays in the box, opened
//   skip      container ids a run never opens (prefixes): the dead, graves, the ground, your own stash, a home's
export const CREW_RUN = { reach: 260, boxes: 3, carry: 30, skip: ['body:', 'grave:', 'ground:', 'crew:', 'home:'] };

export function validateSupply() {
  const bad = [];
  if (!(CREW_RUN.reach > 0 && CREW_RUN.boxes >= 1 && CREW_RUN.carry > 0)) bad.push('CREW_RUN reach, boxes, carry');
  if (!Array.isArray(CREW_RUN.skip) || CREW_RUN.skip.some((p) => typeof p !== 'string' || !p.endsWith(':'))) bad.push('CREW_RUN.skip: id prefixes ending in ":"');
  return { ok: !bad.length, bad };
}
