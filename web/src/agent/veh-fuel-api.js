// VEHICLES V2 (Robert's 11-12 wishlist, docs/status/vehicles-v2.md) as COMMANDS rows and selftest checks.
// buildCommands() in api.js spreads vehiclesV2Commands into COMMANDS; runSelfTest() calls vehiclesV2Checks.
// Slice 1, FUEL TYPES (src/data/fuels.js): gasoline and diesel per engine; red and yellow cans; a station's gasoline and
// diesel tanks; the wrong fuel chokes the engine and a siphon hose drains it.
import { VEHICLES } from '../systems/vehicles.js';
import { ITEMS } from '../data/items.js';
import { FUELS, engineFuel, validateFuels, badShare, FUEL_RULES } from '../data/fuels.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function vehiclesV2Commands(api, need) {
  const g = api.g;
  return {
    fuel: {
      group: 'vehicle', desc: 'FUEL TYPES: action=rows (what every row burns) | view id=<vehicle> (its fuel, the litres and the wrong fuel in it) | pour id= kind=gasoline|diesel litres= (a can\'s pour, testing) | drain id=.',
      args: { action: { type: 'string', default: 'rows', enum: ['rows', 'view', 'pour', 'drain'] }, id: { type: 'string' }, kind: { type: 'string' }, litres: { type: 'number', default: 10 } },
      run: async ({ action, id, kind, litres }) => {
        if (action === 'rows') return { fuels: FUELS, rows: Object.fromEntries(Object.keys(VEHICLES).map((t) => [t, engineFuel(t, VEHICLES)])) };
        const v = id ? api.findVeh(id) : g.player.inVehicle ?? g.lastVehicle;
        need(v, `no vehicle ${id ?? '(in or last)'}`);
        if (action === 'pour') {
          need(FUELS[kind], 'kind=gasoline|diesel');
          const can = FUELS[kind].can, I = g.inventory;
          I.add(I.carried, can, 1); const i = I.carried.slots.findIndex((s) => s.id === can && s.left > 0);
          const r = I.use(i); return { ...r, view: view(v) };
        }
        if (action === 'drain') { const was = g.inventory.hasTag('hose'); if (!was) g.inventory.add(g.inventory.carried, 'siphon_hose', 1); const i = g.inventory.carried.slots.findIndex((s) => s.id === 'siphon_hose'); const r = g.inventory.use(i); return { ...r, view: view(v) }; }
        return view(v);
      },
    },
  };
}
const view = (v) => ({ id: v.id, type: v.type, burns: v.fuelType ?? null, fuel: r1(v.fuel ?? 0), fuelCap: v.fuelCap, bad: r1(v.bad ?? 0), share: +badShare(v).toFixed(3), engine: +(v.dmg?.engine ?? 1).toFixed(3) });

export async function vehiclesV2Checks(api, check, C) {
  const g = api.g, I = () => g.inventory;
  const cleanup = [];
  const spawn = async (type, x, z, h = 0) => { const r = await C('spawnVehicle', { type, x, z, heading: h }); const v = g.vehicles.find((q) => q.id === r.id); cleanup.push(v); return v; };
  // The pack: emptied for the slice's checks (room for cans and a hose), put back as it was after each.
  let pack = null, cap0 = 0;
  const roomy = () => { if (pack) return; pack = I().carried.slots.splice(0); cap0 = I().carried.cap; I().carried.cap = Math.max(cap0, 200); I().changed?.(); };
  const unpack = () => { if (!pack) return; I().carried.slots.splice(0, I().carried.slots.length, ...pack); I().carried.cap = cap0; pack = null; I().changed?.(); };
  const off = () => { if (g.player.inVehicle) g.exitVehicle(true); for (const v of cleanup.splice(0)) if (g.vehicles.includes(v)) g.vehiclesSys.remove(v); g.driveOverride = null; unpack(); };
  const useCan = (can) => { roomy(); I().add(I().carried, can, 1); const i = I().carried.slots.findIndex((s) => s.id === can && s.left > 0); return I().use(i); };
  const holdW = async (sec) => { g.input.down.add('KeyW'); try { await api._step(Math.round(sec * 60)); } finally { g.input.down.delete('KeyW'); } };
  const clear = { x: 0, z: -70 };

  await check('fuel types: every engine row burns gasoline or diesel (semis, rigs, the bus and the military trucks diesel; cars and bikes gasoline); trailers and rafts none; red and yellow cans', async () => {
    const bad = validateFuels(VEHICLES, ITEMS);
    const want = { sedan: 'gasoline', bike: 'gasoline', interceptor: 'gasoline', semi: 'diesel', rig: 'diesel', bus: 'diesel', apc: 'diesel', patrol: 'diesel', raft: null, boxtrailer: null };
    const miss = Object.entries(want).filter(([t, f]) => VEHICLES[t] && engineFuel(t, VEHICLES) !== f);
    return !bad.length && !miss.length && ITEMS.diesel_can && ITEMS.fuel_can.fuel === 'gasoline' ? true : JSON.stringify({ bad, miss });
  });

  await check('fuel types: a spawned semi knows it burns diesel; the dash reads DIESEL, a sedan\'s GAS', async () => {
    try {
      await C('teleport', clear);
      const s = await spawn('semi', clear.x + 12, clear.z), c = await spawn('sedan', clear.x - 8, clear.z);
      g.enterVehicle(s); await api._step(3); const semiLbl = document.querySelector('.fuel-label')?.textContent;
      g.exitVehicle(true); g.enterVehicle(c); await api._step(3); const carLbl = document.querySelector('.fuel-label')?.textContent;
      return s.fuelType === 'diesel' && c.fuelType === 'gasoline' && semiLbl === 'DIESEL' && carLbl === 'GAS' ? true : JSON.stringify({ s: s.fuelType, c: c.fuelType, semiLbl, carLbl });
    } finally { off(); }
  });

  await check('fuel types: a can of diesel in a sedan: it coughs and wears under throttle; more of it and the engine will not fire; the hose drains it and gas makes it run', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('sedan', clear.x + 3, clear.z, 0);
      g.enterVehicle(v); v.fuel = 10; v.bad = 0;
      const gas = useCan('fuel_can'); // the right can: clean
      const clean = view(v);
      const d1 = useCan('diesel_can'); // 10 L diesel on 20 L gas: a third of the tank, past the stall share
      const after = view(v);
      const x0 = v.x, z0 = v.z; await holdW(2.5);
      const moved = Math.hypot(v.x - x0, v.z - z0);
      // Drain it (the hose, used at the car), then two red cans: it runs again.
      g.exitVehicle(true); await api._step(2);
      roomy(); if (!I().hasTag('hose')) I().add(I().carried, 'siphon_hose', 1);
      const dr = I().use(I().carried.slots.findIndex((s) => s.id === 'siphon_hose'));
      useCan('fuel_can'); useCan('fuel_can');
      const fixed = view(v);
      // A light mix (5%): it runs, weak, and the engine wears while you hold the throttle.
      v.fuel = 38; v.bad = 2; v.dmg.engine = 1; const e0 = v.dmg.engine;
      const hp0 = v.hp; g.enterVehicle(v); const x1 = v.x, z1 = v.z; await holdW(1.5);
      const moved2 = Math.hypot(v.x - x1, v.z - z1), worn = e0 - v.dmg.engine, hit = hp0 - v.hp; // hit: a crash would wear it too
      const ok = gas.ok && clean.bad === 0 && d1.ok && /WRONG FUEL/.test(d1.text) && after.share >= FUEL_RULES.stall && moved < 0.5
        && dr.ok && fixed.fuel === 20 && fixed.bad === 0 && moved2 > 4 && worn > 0 && worn < 0.05 && hit === 0;
      return ok ? true : JSON.stringify({ gas, clean, d1, after, moved: r1(moved), dr, fixed, moved2: r1(moved2), worn, hit });
    } finally { off(); }
  });

  await check('fuel types: a station has a gasoline tank and a diesel tank; the hose fills a semi from the diesel caps and refuses a sedan; an empty yellow can fills from diesel only', async () => {
    const R = g.streamer?.W?.roadside, S = g.roadside;
    if (!R || !S) return 'no roadside';
    const site = R.sites.find((s) => s.id === 'furnace_fuel');
    const gasT = R.tanks.find((t) => t.site === site.id && t.kind === 'tank' && t.fuel === 'gasoline'), dslT = R.tanks.find((t) => t.site === site.id && t.kind === 'tank' && t.fuel === 'diesel');
    if (!gasT || !dslT) return JSON.stringify({ gas: !!gasT, diesel: !!dslT });
    const saved = S.save();
    try {
      roomy(); if (!I().hasTag('hose')) I().add(I().carried, 'siphon_hose', 1);
      await C('teleport', { x: dslT.x + 0.3, z: dslT.z + 0.2 }); await api._step(2);
      const near = S.spotNear(g.player);
      const car = await spawn('sedan', dslT.x + 4.5, dslT.z, 0); car.fuel = 5;
      const refuse = S.siphon(dslT.id);
      g.vehiclesSys.remove(car); cleanup.splice(cleanup.indexOf(car), 1);
      const semi = await spawn('semi', dslT.x + 5, dslT.z, 0); semi.fuel = 5;
      const l0 = S.litres(dslT), f0 = semi.fuel;
      const into = S.siphon(dslT.id);
      const took = semi.fuel - f0;
      return near?.id === dslT.id && /diesel/.test(near.label) && !refuse.ok && /burns gasoline/.test(refuse.why) && into.ok && into.fuel === 'diesel' && Math.abs(took - l0) < 0.2 && semi.bad === 0
        ? true : JSON.stringify({ near: near?.id, label: near?.label, refuse, into, took: r1(took), l0 });
    } finally { off(); S.load(saved); }
  });

  await check('fuel types: the litres and the wrong fuel in a tank ride the save', async () => {
    try {
      await C('teleport', clear);
      const v = await spawn('pickup', clear.x + 6, clear.z);
      v.fuel = 33.3; v.bad = 4.4;
      const sv = (await C('save')).save, row = sv.vehicles.find((q) => q.id === v.id);
      v.fuel = 80; v.bad = 0;
      await C('load', { save: sv });
      const w = g.vehicles.find((q) => q.id === v.id && q.type === 'pickup');
      if (w && w !== v) cleanup.push(w);
      return row?.fuel === 33.3 && row?.bad === 4.4 && w && Math.abs(w.fuel - 33.3) < 0.05 && Math.abs(w.bad - 4.4) < 0.05 ? true : JSON.stringify({ row, w: w && view(w) });
    } finally { off(); }
  });
}
