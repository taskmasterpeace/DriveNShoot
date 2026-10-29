// CREW JOBS as rows (docs/design/WEB_CREW.md §4): "If you're gonna have a crew, they're gonna have to do stuff."
// A job is a skill used + inputs + outputs + a duration + a risk. systems/crew.js runs them on the game clock.
//   id        the row
//   name      what the CREW panel calls it
//   where     road | camp | base: road jobs need the crew in or on your vehicle; camp jobs need you stopped (camp
//             made: a parked rig, a bed, a fire, or the camp order); base jobs need a claimed building (crew.claimBase:
//             the hook a base-building lane plugs into)
//   skill     the crew skill (data/crew.js CREW_SKILLS) that sets speed and quality: mul = 0.5 + 0.25 x skill (1 → 0.75, 5 → 1.75)
//   hours     game hours a cycle takes at mul 1
//   inputs    items taken from the crew pool (your carried pack, then the rig's trunk) at the start of a cycle
//   outputs   what a cycle makes: items into your pack; or an effect (below) with its size
//   effect    the system verb: heal | mend | clean | feed | watch | lookout | navigate | drive | gun | guard | scavenge
//             | repair | ammo | radio | farm
//   risk      0-1: an off-screen job's chance of trouble per cycle (wounds; trouble x risk again = they do not come back)
//   offscreen true: the member leaves the map for the duration (a run), and comes back with what the roll says
//   repeat    true: loops until reassigned
export const CREW_JOBS = [
  // ---- on the road -------------------------------------------------------------------------------------------------
  { id: 'driver', name: 'DRIVER', where: 'road', skill: 'driving', hours: 0, effect: 'drive', repeat: true, desc: 'takes the wheel of your rig (you ride shotgun and shoot)' },
  { id: 'gunner', name: 'GUNNER (MOUNT)', where: 'road', skill: 'shooting', hours: 0, effect: 'gun', repeat: true, desc: 'works the hood gun or a window: fires at hostiles in reach' },
  { id: 'navigator', name: 'NAVIGATOR', where: 'road', skill: 'scout', hours: 1, effect: 'navigate', outputs: { pin: 1 }, repeat: true, desc: 'reads the road: marks a place worth a look every hour on the move' },
  { id: 'lookout', name: 'LOOKOUT', where: 'road', skill: 'scout', hours: 0, effect: 'lookout', repeat: true, desc: 'calls trouble early: hostiles inside 60 m (x skill) get named before they open up' },
  // ---- at camp -----------------------------------------------------------------------------------------------------
  { id: 'watch', name: 'STAND WATCH', where: 'camp', skill: 'scout', hours: 0, effect: 'watch', repeat: true, desc: 'stays up: wakes you and calls it when anything comes close' },
  { id: 'cook', name: 'COOK', where: 'camp', skill: 'cook', hours: 1, inputs: { any_food: 1 }, effect: 'feed', outputs: { food: 0.35 }, repeat: true, desc: 'turns what you carry into a meal for the whole crew: a real recipe from the stock when the pack allows one (data/cooking.js), else a plain meal from any food' },
  { id: 'mend', name: 'MEND GEAR', where: 'camp', skill: 'mechanic', hours: 2, inputs: { rag: 1 }, effect: 'mend', outputs: { cond: 0.08 }, repeat: true, desc: 'patches what you wear and carry' },
  { id: 'clean', name: 'CLEAN GUNS', where: 'camp', skill: 'gunsmith', hours: 1, effect: 'clean', outputs: { cond: 0.06 }, repeat: true, desc: 'strips and cleans: every gun the crew carries gains condition, jams cleared' },
  { id: 'tend', name: 'TEND WOUNDS', where: 'camp', skill: 'medic', hours: 1, effect: 'heal', outputs: { hp: 18 }, repeat: true, desc: 'patches up the hurt, you included' },
  // ---- at a base (a claimed building) ------------------------------------------------------------------------------
  { id: 'guard', name: 'GUARD POST', where: 'base', skill: 'shooting', hours: 0, effect: 'guard', repeat: true, desc: 'holds the door of the base and shoots what comes at it' },
  { id: 'scav_run', name: 'SCAVENGE RUN', where: 'base', skill: 'scavenge', hours: 6, effect: 'scavenge', risk: 0.22, offscreen: true, outputs: { table: 'crew_run', rolls: 3, pin: 0.5 }, repeat: false, desc: 'goes out alone for six hours: comes back with loot and maybe a map pin, or hurt, or not at all' },
  { id: 'repair', name: 'REPAIR VEHICLES', where: 'base', skill: 'mechanic', hours: 2, inputs: { scrap: 1 }, effect: 'repair', outputs: { hp: 0.15 }, repeat: true, desc: 'works on the rig parked at the base' },
  { id: 'ammo', name: 'CRAFT AMMO', where: 'base', skill: 'gunsmith', hours: 3, inputs: { scrap: 1 }, effect: 'ammo', outputs: { ammo_pistol: 8 }, repeat: true, desc: 'hand-loads rounds from scrap brass' },
  { id: 'radio', name: 'RADIO WATCH', where: 'base', skill: 'scout', hours: 4, effect: 'radio', outputs: { pin: 1 }, repeat: true, desc: 'listens to the static: a distress call or a cache becomes a pin' },
  { id: 'farm', name: 'TEND THE GARDEN', where: 'base', skill: 'cook', hours: 3, effect: 'farm', repeat: true, desc: 'waters the beds from the real water you left, picks what is ripe into the stash, feeds the hens and takes the eggs (systems/farming.js crewTend: nothing grows without seed, water and days)' },
];
export const CREW_JOB_BY_ID = Object.fromEntries(CREW_JOBS.map((j) => [j.id, j]));

// What a scavenge run turns up (rolled on the run's own seed: member id + the hour it left).
export const CREW_RUN_LOOT = [['bandage', 3, 1, 2], ['ammo_pistol', 4, 4, 12], ['ammo_smg', 2, 8, 20], ['scrap', 4, 1, 3], ['canteen', 2, 1, 1], ['rag', 3, 1, 2], ['ammo_shells', 2, 2, 6], ['suture_kit', 1, 1, 1]];

export function validateCrewJobs(jobs = CREW_JOBS, { skills = [], items = null } = {}) {
  const errors = [], ids = new Set();
  const EFFECTS = ['heal', 'mend', 'clean', 'feed', 'watch', 'lookout', 'navigate', 'drive', 'gun', 'guard', 'scavenge', 'repair', 'ammo', 'radio', 'farm'];
  for (const j of jobs) {
    const at = `job "${j.id}"`;
    if (ids.has(j.id)) errors.push(`${at}: duplicate`); ids.add(j.id);
    if (!['road', 'camp', 'base'].includes(j.where)) errors.push(`${at}: where must be road|camp|base`);
    if (skills.length && !skills.includes(j.skill)) errors.push(`${at}: skill ${j.skill} unknown`);
    if (!EFFECTS.includes(j.effect)) errors.push(`${at}: effect ${j.effect} unknown`);
    if (!(j.hours >= 0)) errors.push(`${at}: hours`);
    if (j.risk !== undefined && !(j.risk >= 0 && j.risk <= 1)) errors.push(`${at}: risk 0-1`);
    if (items) for (const k of Object.keys(j.inputs ?? {})) if (k !== 'any_food' && !items[k]) errors.push(`${at}: input ${k} is not an item`);
  }
  if (items) for (const [id] of CREW_RUN_LOOT) if (!items[id]) errors.push(`run loot ${id} is not an item`);
  return { ok: !errors.length, errors, jobs: jobs.length };
}
