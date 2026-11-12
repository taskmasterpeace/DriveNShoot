// FUEL TYPES (Robert 11-12: "fuel types. Regular gas and diesel"). Every engine burns one of two fuels; a can, a
// station's tank and a tanker carry one of them. The wrong one in the tank is not refused at the cap (you can pour
// anything into anything): it sits in the tank as `v.bad` litres, the engine coughs and wears while it runs on the mix,
// and past FUEL_RULES.stall it will not fire at all. Drain it with a siphon hose (the tank empties onto the ground: you
// lose the good fuel with the bad).
//
// Pure data + pure functions (no three.js, no game): tests/fuels.test.mjs runs them in node.
// Source for which engines are diesel: the real-world split (heavy trucks, buses, military trucks, big motor homes,
// work boats run diesel; cars, bikes, light trucks and small outboards run gasoline). Rows not listed burn gasoline.

export const FUELS = {
  gasoline: { name: 'gasoline', short: 'GAS', can: 'fuel_can', color: '#c8482c' },   // red can
  diesel:   { name: 'diesel', short: 'DIESEL', can: 'diesel_can', color: '#d6a822' }, // yellow can
};

// type (or a row's base) -> fuel. Anything with an engine and no entry here burns gasoline.
export const ENGINE_FUEL = {
  rig: 'diesel', semi: 'diesel', bus: 'diesel', apc: 'diesel', patrol: 'diesel', rv: 'diesel', towtruck: 'diesel',
  gunboat: 'diesel', barge: 'diesel', tank_old: 'diesel', tank_new: 'diesel', monster: 'gasoline',
};

export const FUEL_RULES = {
  stall: 0.3,      // share of wrong fuel in the tank past which the engine will not fire
  powerCut: 2.0,   // power x (1 - share * powerCut) while it runs on the mix
  misfire: 0.6,    // seconds between coughs at a full-strength mix (more often the worse it is)
  wear: { diesel: 0.05, gasoline: 0.02 }, // engine health lost a second at full throttle per unit share; keyed by the ENGINE's fuel (gas in a diesel knocks it to bits faster)
};

// Which fuel a vehicle row burns, or null for no engine (trailers, rafts, the ferry, a horse).
export function engineFuel(type, rows = {}) {
  const row = rows[type];
  if (row && (row.noEngine || row.trailer || row.fuelCap === 0)) return null;
  return row?.fuel ?? ENGINE_FUEL[type] ?? (row?.base ? ENGINE_FUEL[row.base] : undefined) ?? 'gasoline';
}

// Which fuel an item carries ('fuel_can' -> gasoline, 'diesel_can' -> diesel), or null if it is not a fuel can.
export function canFuel(itemRow) { return itemRow?.use?.act === 'refuel' ? (itemRow.fuel ?? 'gasoline') : null; }

// Pour `litres` of `kind` into a tank {fuel, bad, fuelCap, fuelType}. Returns {poured, wrong}; mutates the tank.
export function pour(v, kind, litres) {
  const room = Math.max(0, (v.fuelCap ?? 0) - (v.fuel ?? 0));
  const k = Math.min(room, Math.max(0, litres));
  if (k <= 0) return { poured: 0, wrong: false };
  const wrong = !!v.fuelType && !!kind && kind !== v.fuelType;
  v.fuel = (v.fuel ?? 0) + k;
  if (wrong) v.bad = (v.bad ?? 0) + k;
  return { poured: k, wrong };
}

// Burn `litres` out of the tank: the mix burns in proportion, so the wrong share stays the same until topped up.
export function burnOff(v, litres) {
  const f0 = v.fuel ?? 0;
  if (f0 <= 0) { v.fuel = 0; v.bad = 0; return; }
  const f1 = Math.max(0, f0 - litres);
  if (v.bad) v.bad = v.bad * (f1 / f0);
  v.fuel = f1;
}

// The share of wrong fuel in the tank, 0..1.
export function badShare(v) { return v.bad > 0 && v.fuel > 0 ? Math.min(1, v.bad / v.fuel) : 0; }

// What the mix does to the engine this tick: { power multiplier, runs, wear (engine health a second at full throttle) }.
// Called every frame for a car with bad fuel in it: it writes into `out` (a scratch object) rather than allocating.
// The default `out` is SHARED: read its fields now, don't keep the object across calls (the next call rewrites it).
const _mix = { power: 1, runs: true, wear: 0, share: 0 };
export function mixEffect(v, out = _mix) {
  const s = badShare(v);
  out.share = s;
  if (s <= 0.005) { out.power = 1; out.runs = true; out.wear = 0; out.share = 0; }
  else if (s >= FUEL_RULES.stall) { out.power = 0; out.runs = false; out.wear = 0; }
  else { out.power = Math.max(0.1, 1 - s * FUEL_RULES.powerCut); out.runs = true; out.wear = (FUEL_RULES.wear[v.fuelType] ?? 0.03) * s; }
  return out;
}

// A generator (a base's, a bunker's) runs on either: a diesel genset by rights, but it will take a can of gas. The
// diesel can goes first. `count(id)` / `spend(id, n)` are the inventory's own.
export const GENERATOR_CANS = ['diesel_can', 'fuel_can'];
export const genCans = (box) => GENERATOR_CANS.reduce((n, id) => n + (box?.count(id) ?? 0), 0);
export function spendGenCans(inv, n) { for (const id of GENERATOR_CANS) { const k = Math.min(n, inv.carried.count(id)); if (k > 0) { inv.spend(id, k); n -= k; } if (n <= 0) break; } return n <= 0; }

// Empty the tank (a siphon hose run into the dirt): good and bad together.
export function drain(v) { const l = v.fuel ?? 0; v.fuel = 0; v.bad = 0; return l; }

// A tank's fuel at a station: its spot carries `fuel`, an old save's spot without one is gasoline.
export const tankFuel = (sp) => sp?.fuel ?? 'gasoline';

export function validateFuels(rows, items) {
  const bad = [];
  for (const [k, f] of Object.entries(FUELS)) {
    if (!items[f.can]) bad.push(`${k}: no can item ${f.can}`);
    else if (canFuel(items[f.can]) !== k) bad.push(`${f.can} carries ${canFuel(items[f.can])}, not ${k}`);
  }
  for (const [t, f] of Object.entries(ENGINE_FUEL)) if (!FUELS[f]) bad.push(`${t}: unknown fuel ${f}`);
  for (const t of Object.keys(rows)) { const f = engineFuel(t, rows); if (f && !FUELS[f]) bad.push(`${t}: burns ${f}`); }
  return bad;
}
