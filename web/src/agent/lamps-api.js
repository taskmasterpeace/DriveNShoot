// THE OIL LAMP for agents (docs/design/WEB_LAMPS.md; rows data/gadgets.js oil_lamp.lamp; the rule systems/gadgets.js
// lamp / lampToggle / lampShine): the `lamps` command and the checks.
import { GADGETS } from '../data/gadgets.js';
import { ITEMS } from '../data/items.js';
import { RECIPE_BY_ID } from '../data/recipes.js';
import { freeSpot } from './citygen-api.js';

const r1 = (v) => Math.round(v * 10) / 10;

export function lampCommands(api) {
  const g = api.g;
  return {
    lamps: {
      group: 'world', desc: 'THE OIL LAMP (docs/design/WEB_LAMPS.md): a lamp you build at a workbench, set down (USE it from the pack) and it burns lamp oil by the game clock, six hours a flask. Tap E at it to put it out or light it (dry: it takes a flask from your pack); hold E to take it up (a lamp that has burned comes back dry). The lit lamp nearest you carries the one real light; the infected see a lit lamp at night when they have a line to it. Lists every lamp set, the light, and the rows. toggle=<id> lights or puts out one lamp as you would with E.',
      args: { toggle: 'a lamp id: light it or put it out (as tapping E at it)' },
      run: async (a) => {
        const GX = g.gadgets, L = GADGETS.oil_lamp.lamp;
        let did = null;
        if (a.toggle) { const p = GX.byId(String(a.toggle)); did = p?.def.lamp ? GX.lampToggle(p, g.player) : { ok: false, why: 'no such lamp' }; }
        return {
          did,
          lamps: GX.list.filter((p) => p.def.lamp).map((p) => ({ id: p.id, x: r1(p.x), z: r1(p.z), floor: r1(p.gy ?? 0), on: !!p.on, oilHours: +(p.oil ?? 0).toFixed(2), carriesTheLight: GX.lampAt === p })),
          light: { on: GX.lampLight.intensity > 0, at: GX.lampAt?.id ?? null, power: r1(GX.lampLight.intensity) },
          onYou: { lamps: g.inventory.carried.count('oil_lamp'), dry: g.inventory.carried.count('oil_lamp_dry'), oil: g.inventory.carried.count(L.oil) },
          hour: r1(g.sky.time), night: r1(g.sky.night ?? 0), rows: L,
        };
      },
    },
  };
}

export async function lampChecks({ g, api, C, check, hush }) {
  const GX = g.gadgets, inv = g.inventory, L = GADGETS.oil_lamp.lamp;
  const clear = () => { for (const p of [...GX.list]) if (p.def.lamp) GX.remove(p); };
  const slotOf = (id) => inv.carried.slots.findIndex((s) => s.id === id);
  const drain = (id) => { const n = inv.carried.count(id); if (n) inv.spend(id, n); };
  const pass = (h) => { g.sky.time = (g.sky.time + h) % 24; }; // the clock moves on (as a wait or a sleep moves it)

  await check('lamps: the rows - the oil lamp is the built item (the recipe eats a flask of oil and that flask is in it), a thing you USE from the pack; the dry lamp weighs what the lamp does less the flask; both rows burn the same oil at the same rate and name each other; there is one lamp light in the scene and it is dark with no lamp lit', async () => {
    const A = GADGETS.oil_lamp, B = GADGETS.oil_lamp_dry, R = RECIPE_BY_ID.make_oil_lamp;
    const lights = () => { let n = 0; g.scene.traverse((o) => { if (o.isLight) n++; }); return n; };
    clear(); await api._step(2);
    const ok = A?.trigger === 'lamp' && B?.trigger === 'lamp' && A.lamp.start === 1 && B.lamp.start === 0 && A.lamp.burn === B.lamp.burn && A.lamp.burn >= 1 && A.lamp.burn <= 24 &&
      A.lamp.oil === 'oil_flask' && !!ITEMS.oil_flask && A.lamp.full === 'oil_lamp' && A.lamp.dry === 'oil_lamp_dry' && B.lamp.full === 'oil_lamp' && B.lamp.dry === 'oil_lamp_dry' &&
      ITEMS.oil_lamp?.use?.act === 'gadget' && ITEMS.oil_lamp.kind === 'gadget' && ITEMS.oil_lamp_dry?.use?.act === 'gadget' &&
      Math.abs(ITEMS.oil_lamp.kg - ITEMS.oil_flask.kg - ITEMS.oil_lamp_dry.kg) < 1e-6 &&
      !!R && R.inputs.some(([id, n]) => id === 'oil_flask' && n === 1) && R.outputs.some(([id]) => id === 'oil_lamp') &&
      A.lamp.grace > 0 && A.lamp.grace <= 0.05 && A.lamp.r >= 4 && A.lamp.r <= 20 && A.lamp.near > A.lamp.r && GX.lampLight.isLight && GX.lampLight.intensity === 0;
    const n0 = lights(); const p = GX.place('oil_lamp', g.player.x + 1, g.player.z, 0, g.player, { gy: g.player.gy ?? 0, oil: L.burn, on: true, at: g.sky.time }); await api._step(3);
    let n1, lit; try { n1 = lights(); lit = GX.lampLight.intensity > 0; } finally { GX.remove(p); } await api._step(2);
    return (ok && n0 === n1 && lit && GX.lampLight.intensity === 0) || JSON.stringify({ ok, n0, n1, lit, after: GX.lampLight.intensity, kg: [ITEMS.oil_lamp?.kg, ITEMS.oil_flask?.kg, ITEMS.oil_lamp_dry?.kg] });
  });

  await check('lamps: it burns YOUR oil by the clock - USE the lamp from the pack: it stands lit in front of you with one flask (6 h) in it, the pack no longer holds it, and the light is on at it; an hour on it holds an hour less; tapped, it is out and the light is dark; taken up after burning it comes back as a DRY lamp and no oil with it (a lamp that never burned comes back whole); set down dry it is dark, and it will not light with no flask on you; with a flask it takes exactly one and burns again; after its hours it goes out by itself and says so once; the save carries its oil and whether it is lit', async () => {
    await C('start'); g.godMode = true;
    const hour0 = g.sky.time;
    try {
      clear(); for (const id of ['oil_lamp', 'oil_lamp_dry', 'oil_flask']) drain(id);
      const s = freeSpot(g, -6000, -12000, 60) ?? { x: 0, z: -40 };
      await C('teleport', { x: s.x, z: s.z }); await C('setTime', { hour: 22 }); await api._step(20);
      const P = g.player;
      inv.stow('oil_lamp', 1);
      const used = inv.use(slotOf('oil_lamp')); await api._step(3);
      const T = GX.list.find((p) => p.def.lamp);
      if (!used?.ok || !T) return 'it did not go down: ' + JSON.stringify(used);
      const a = { on: T.on, oil: T.oil, inPack: inv.carried.count('oil_lamp'), light: GX.lampLight.intensity > 0, at: Math.hypot(GX.lampLight.position.x - T.x, GX.lampLight.position.z - T.z) < 0.01, lit: T.lit };
      pass(1); await api._step(3);
      const afterHour = T.oil;
      const off = GX.lampToggle(T, P); await api._step(3);
      const b = { ok: off.ok, on: T.on, light: GX.lampLight.intensity, lit: T.lit };
      pass(2); await api._step(3); const heldOut = T.oil; // out: it burns nothing
      GX.pickUp(T, P); await api._step(2);
      const c = { full: inv.carried.count('oil_lamp'), dry: inv.carried.count('oil_lamp_dry'), oil: inv.carried.count('oil_flask'), left: GX.list.filter((p) => p.def.lamp).length };
      // a fresh one, taken straight up, is still a full lamp
      inv.stow('oil_lamp', 1); inv.use(slotOf('oil_lamp')); await api._step(2);
      const F = GX.list.find((p) => p.def.lamp); GX.lampToggle(F, P); GX.pickUp(F, P); await api._step(2);
      const fresh = { full: inv.carried.count('oil_lamp'), dry: inv.carried.count('oil_lamp_dry') };
      drain('oil_lamp');
      // the dry one
      const usedDry = inv.use(slotOf('oil_lamp_dry')); await api._step(3);
      const D = GX.list.find((p) => p.def.lamp);
      if (!usedDry?.ok || !D) return 'the dry lamp did not go down';
      const d = { on: D.on, oil: D.oil, light: GX.lampLight.intensity };
      const noOil = GX.lampToggle(D, P);
      inv.stow('oil_flask', 2);
      const fill = GX.lampToggle(D, P); await api._step(3);
      const e = { ok: fill.ok, on: D.on, oil: D.oil, flasks: inv.carried.count('oil_flask'), light: GX.lampLight.intensity > 0 };
      const rec = GX.save().list.find((q) => q.id === D.id);
      const ev0 = g.eventSeq;
      pass(L.burn - 0.5); await api._step(3); const nearEnd = { on: D.on, oil: D.oil };
      pass(1); await api._step(3); await api._step(30);
      const outs = g.events.filter((q) => q.seq > ev0 && q.type === 'lampOut').length;
      const f = { on: D.on, oil: D.oil, lit: D.lit, light: GX.lampLight.intensity, flasks: inv.carried.count('oil_flask') };
      const ok = a.on === true && Math.abs(a.oil - L.burn) < 0.01 && a.inPack === 0 && a.light && a.at && a.lit === 1 &&
        Math.abs(afterHour - (L.burn - 1)) < 0.02 && b.ok && b.on === false && b.light === 0 && b.lit === 0 && Math.abs(heldOut - afterHour) < 1e-6 &&
        c.full === 0 && c.dry === 1 && c.oil === 0 && c.left === 0 && fresh.full === 1 && fresh.dry === 1 &&
        d.on === false && d.oil === 0 && d.light === 0 && noOil.ok === false &&
        e.ok && e.on && Math.abs(e.oil - L.burn) < 0.01 && e.flasks === 1 && e.light &&
        rec && rec.on === true && Math.abs(rec.oil - L.burn) < 0.01 &&
        nearEnd.on === true && Math.abs(nearEnd.oil - 0.5) < 0.02 && f.on === false && f.oil === 0 && f.lit === 0 && f.light === 0 && f.flasks === 1 && outs === 1;
      return ok || JSON.stringify({ a, afterHour, b, heldOut, c, fresh, d, noOil, e, rec, nearEnd, f, outs });
    } finally { clear(); for (const id of ['oil_lamp', 'oil_lamp_dry', 'oil_flask']) drain(id); g.sky.time = hour0; g.godMode = false; }
  });

  await check('lamps: the dead see a light at night - an infected 18 m from a lit lamp with a clear line to it, at night and with you far off, turns to the light (the light count goes up); with the lamp put out it does not; by day a lit lamp draws nothing', async () => {
    await C('start'); g.godMode = true;
    const hour0 = g.sky.time, made = [];
    try {
      clear();
      const s = freeSpot(g, -6000, -12000, 60) ?? { x: 0, z: -40 };
      await C('teleport', { x: s.x, z: s.z }); await C('setTime', { hour: 23 }); await api._step(20);
      const P = g.player;
      let dir = null;
      for (let k = 0; k < 16 && !dir; k++) { const dx = Math.sin(k * 0.3927), dz = Math.cos(k * 0.3927); if (g.statics.raycast(P.x, P.z, dx, dz, 22, 0, -1) >= 22) dir = { dx, dz }; }
      if (!dir) return 'no clear line';
      for (const c of [...g.chars]) if (c !== P && !c.npc && Math.hypot(c.x - P.x, c.z - P.z) < 120) g.removeChar(c);
      const T = GX.place('oil_lamp', P.x, P.z, 0, P, { gy: P.gy ?? 0, oil: L.burn, on: true, at: g.sky.time });
      const lx = T.x, lz = T.z;
      const run = async (on, hour) => {
        await C('setTime', { hour }); T.oil = L.burn; T.at = g.sky.time; T.on = on; await api._step(2);
        await C('teleport', { x: lx - dir.dx * 110, z: lz - dir.dz * 110 }); await api._step(5);
        const z = g.addChar({ x: lx + dir.dx * 18, z: lz + dir.dz * 18, faction: 'zombie', weapon: null, hp: 100, name: 'Lamp watcher (selftest)', flag: 'US' }); made.push(z);
        const n0 = g.zombies.counts.lights; await api._step(60 * 5);
        const n = g.zombies.counts.lights - n0, moved = Math.hypot(z.x - (lx + dir.dx * 18), z.z - (lz + dir.dz * 18)), toward = Math.hypot(z.x - lx, z.z - lz) < 17.5;
        g.removeChar(z);
        return { n, moved: r1(moved), toward, night: r1(g.sky.night ?? 0) };
      };
      const lit = await run(true, 23), dark = await run(false, 23), day = await run(true, 12);
      const ok = lit.n >= 1 && lit.toward && dark.n === 0 && day.n === 0;
      return ok || JSON.stringify({ lit, dark, day });
    } finally { for (const z of made) if (g.chars.includes(z)) g.removeChar(z); clear(); g.sky.time = hour0; g.godMode = false; await C('teleport', { x: 0, z: -40 }); await api._step(3); }
  });
}
