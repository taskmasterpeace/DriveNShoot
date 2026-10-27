// LIFE INSURANCE AS ROWS (docs/design/WEB_INSURANCE_JOURNEYS.md). Robert, 2026-10-27: "You need to pay your life insurance
// in order to get clones to be able to come back once you die. And even then, you got to choose what city you want to
// come back in. Because it's only the major cities that have the cloning centers."
//
// The display name is LIFE INSURANCE; the mechanism underneath stays the PRESSING (data/clones.js): a policy is a pressing
// with terms. You sign at any vat counter (a major city's cloning centre or a small town's PRESSING OFFICE), the premium
// comes out of the brine book (then your pockets) at each new day, and a policy that falls more than its grace behind
// LAPSES: the vat pours the pressing out and the next death is flat. Only the major centres grow bodies; an office scans
// you and files the pressing with its HOME CENTRE (the nearest major city). When you die you choose the centre you come up
// in (the city picker); the home centre is free, any other costs the transfer.
// systems/insurance.js reads these. No purple; our own words (tools/ip-lint.mjs).

export const INSURANCE_RULES = {
  // The town covers its newcomers' first week (the free starter pressing): then the BASIC premium is due like anyone's.
  starterDays: 7,
  // Waking at a centre other than your policy's home: the brine has to be shipped. fee = round((base + perMul * |priceMul
  // difference| + perKm * km between the centres / 100) * policy.transferMul), paid from the brine book then pockets. The
  // home centre always costs nothing: a policy never leaves you with nowhere to come up.
  transfer: { base: 30, perMul: 260, perKm: 6 },
  // A pressing older than its policy's staleDays is COLD: the centre will only grow it where it is filed (no transfer) and
  // the new body takes twice as long to settle (brine-sick hours x coldSickMul).
  coldSickMul: 2,
  warnStale: 0.75,        // a toast when a pressing is this share of the way to cold (once a day)
  // The tow (IRON COVER): your husk's car is hauled to the lot behind the centre you come up in, trunk and all; whatever
  // the pickers took before the tow truck got there is gone. A car past the dust or already burned stays where it is.
  towLot: { off: 14 },
  // The picker on death: how long the city board waits before it takes the default (real seconds; the world is black).
  pickerSecs: 45,
};

// The policies. premium: scrip a day (the home centre's upkeepMul scales it); signMul: the sign-up (a pressing's price x);
// graceDays: unpaid days before it lapses; staleDays: how old the pressing may be before it is cold; sickHours: brine
// sickness on waking; kit: what the centre hands the new body (rows below); tow: your husk's car hauled to the centre;
// transferMul: scales the fee for coming up somewhere else; repress: the centre takes a fresh pressing as you come up, so
// you are covered again at once (the policy goes on, the premium with it).
export const POLICIES = {
  basic: {
    id: 'basic', name: 'DUST COVER', tier: 1, premium: 20, signMul: 1, graceDays: 2, staleDays: 4, sickHours: 24,
    kit: 'loaner', tow: false, transferMul: 1.5, repress: false,
    blurb: 'The cheapest body in the brine. A loaner and a bottle. Keep the pressing fresh: it goes cold in four days.',
  },
  standard: {
    id: 'standard', name: 'ROAD COVER', tier: 2, premium: 35, signMul: 1.25, graceDays: 3, staleDays: 10, sickHours: 18,
    kit: 'road', tow: false, transferMul: 1, repress: false,
    blurb: 'For people who drive the interstate. Six rounds in the loaner, a bandage, ten days before the pressing goes cold.',
  },
  premium: {
    id: 'premium', name: 'IRON COVER', tier: 3, premium: 70, signMul: 1.75, graceDays: 4, staleDays: 30, sickHours: 10,
    kit: 'iron', tow: true, transferMul: 0.5, repress: true,
    blurb: 'Your car towed to the lot behind the centre, a fresh pressing as you come up, a full loaner, a pack.',
  },
};

// What each policy's centre hands a body coming up out of the brine (the engine's hands need a gun: the loaner).
export const KITS = {
  loaner: { gun: 'pistol', cond: 0.35, loaded: 0, ammo: 0, items: [['water_bottle', 1], ['rag', 1]] },
  road: { gun: 'pistol', cond: 0.5, loaded: 6, ammo: 6, items: [['water_bottle', 1], ['rag', 1], ['bandage', 1]] },
  iron: { gun: 'pistol', cond: 0.75, loaded: 12, ammo: 12, items: [['canteen', 1], ['bandage', 2], ['jerky', 1]], pack: 'satchel' },
};

// The cloning centres: only the major cities grow bodies (data/clones.js VATS rows with major: true). Robert's five plus
// Phoenix (the fifth-largest city: Rust Haven's brine room is the metro's centre, so the start region keeps one). The
// other vat rows are PRESSING OFFICES: they scan, sell policies and keep the brine book; the body grows at the home centre.
export const MAJOR_CENTRES = ['rust_haven', 'los_angeles', 'miami', 'houston', 'new_york', 'chicago'];
