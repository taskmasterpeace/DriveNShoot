// GADGETS-2 as COMMANDS rows and the selftest share (docs/design/WEB_GADGETS2.md; systems/kit.js; data/gadgets.js KIT,
// CELLS, HEAT, AIR_ZONES, CHEM_ZONES, CHATTER; data/workshop.js hubspikes / spotlight / winch; data/dogs.js DOG_GEAR).
import { KIT, CELLS, CHEM_ZONES, validateKit } from '../data/gadgets.js';
import { DOG_GEAR, BREEDS, validateDogGear } from '../data/dogs.js';
import { validateWorkshop } from '../data/workshop.js';
import { validateKnowledge } from '../data/pulls.js';
import { ITEMS, LOOT } from '../data/items.js';
import { Color } from 'three';

const r1 = (v) => Math.round(v * 10) / 10;
const KITS = Object.keys(KIT), GIVE = [...KITS, ...Object.keys(CELLS), ...Object.keys(DOG_GEAR)];

export function kitCommands(api, need) {
  const g = api.g;
  return {
    kit: {
      group: 'player', desc: `The kit you wear and look through (data/gadgets.js KIT: ${KITS.join(', ')}; systems/kit.js, docs/design/WEB_GADGETS2.md). No args: what you carry, what is on in each slot (eyes, glass, beam, ears, face) and the charge left in its cell or filter, how many cells and filters you carry, the goggles' blind (0..1), the bad air you stand in and whether the mask is breathing for you, how much further you are seen tonight (seenMul), who and what the glass marked, what the scanner heard (and the last key-up on the air, heard or not), your dogs' gear, the counts. give=<${GIVE.join('|')}> n= puts it in your pack; on=<id> switches a piece on (its slot's choice; flat with no cells: refused); off=<slot> switches a slot off; look=true|false holds the binoculars or the scope to your eye (aim= radians fixes the look; the camera rises and leans out, and what is in the cone and in line of sight is marked); charge=<seconds> sets the cell in the piece named by on= (staging); dog=<dog gear id> puts it on your nearest dog; heat=<char id> reads a body's temperature; winch=door hooks the nearest door or gate in reach of the car you drive (its winch); spot=true|false switches your car's roof spotlight. Keys: 7 optics (goggles, heat scope, off), 8 the glass, 9 the scanner.`,
      args: { give: { type: 'string', enum: GIVE }, n: { type: 'number', default: 1 }, on: { type: 'string', enum: KITS }, off: { type: 'string', enum: ['eyes', 'glass', 'beam', 'ears', 'face'] }, look: { type: 'boolean' }, aim: { type: 'number' }, charge: { type: 'number' }, dog: { type: 'string', enum: Object.keys(DOG_GEAR) }, heat: { type: 'string' }, winch: { type: 'string', enum: ['door'] }, spot: { type: 'boolean' } },
      run: async (a) => {
        const K = g.kit, P = g.player;
        if (a.give) return { gave: g.inventory.stow(a.give, a.n), item: a.give, carried: K.carried(a.give) };
        if (a.on) {
          need(K.carried(a.on), `you carry no ${KIT[a.on].name.toLowerCase()} (give=${a.on})`);
          if (a.charge !== undefined) K.charge[a.on] = Math.max(0, a.charge);
          const s = KIT[a.on].slot;
          if (s === 'glass') { K.on.glass = a.on; if (a.aim !== undefined) K.aimOverride = a.aim; need(K.setLook(true), 'not now (at the wheel, or flying a drone)'); return { kit: K.view() }; }
          K.on[s] = a.on;
          need(K.powered(a.on), `the ${KIT[a.on].name.toLowerCase()} is flat and you carry no ${CELLS[KIT[a.on].power.cell].name.toLowerCase()}`);
          return { kit: K.view() };
        }
        if (a.off) { K.set(a.off, null); return { kit: K.view() }; }
        if (a.look !== undefined) { K.on.glass ??= 'auto'; if (a.aim !== undefined) K.aimOverride = a.aim; if (!a.look) K.aimOverride = undefined; need(!a.look || K.setLook(true), K.active('glass') ? 'not now (at the wheel, or flying a drone)' : 'no binoculars or scope on you'); if (!a.look) K.setLook(false); return { kit: K.view() }; }
        if (a.dog) { const r = K.dress(a.dog); need(r.ok, r.why); return { ...r, kit: K.view() }; }
        if (a.heat) { const c = g.chars.find((x) => x.id === a.heat) ?? g.dogs?.byId?.(a.heat); need(c, `no body ${a.heat}`); return { id: a.heat, heat: r1(K.heatOf(c)), air: r1(K.airC()), alive: c.alive !== false && !c.dead, infected: c.faction === 'zombie' }; }
        if (a.winch) {
          const v = P.inVehicle; need(v && K.hasWinch(v), 'you need to be in a car with a winch (data/workshop.js UTILITY winch)');
          const fx = Math.sin(v.h), fz = Math.cos(v.h);
          const d = K.hookDoor(v, v.x + fx * 10, v.z + fz * 10, 30) ?? K.hookDoor(v, v.x - fx * 10, v.z - fz * 10, 30); need(d, 'no door or gate within 30 m of the car');
          return { hooked: d.id, gate: !!d.gate };
        }
        if (a.spot !== undefined) { const v = P.inVehicle; need(v?.utility?.spotlight, 'no roof spotlight on the car you are in'); v.spotOn = a.spot; return { spot: a.spot }; }
        return { kit: K.view() };
      },
    },
  };
}

// ---- the selftest share ---------------------------------------------------------------------------------------------
// Staged on open ground; the battery's `staged` flag (cells hold, the beam needs no torch) is cleared for these checks
// and put back after. Each check names the gadget and what it proves.
export async function kitChecks(api, check, C) {
  const g = api.g, P = () => g.player, K = g.kit;
  const was = { staged: K.staged, z: g.zombies.enabled, r: g.raiderTimer, conv: g.convoy.next, fo: g.flashOverride, slots: null, on: { ...K.on }, charge: { ...K.charge } };
  const tagged = [];
  const mark = (c) => { c.kitTest = true; tagged.push(c); return c; };
  const clean = () => {
    for (const c of [...g.chars]) if (c.kitTest) g.removeChar(c);
    for (const v of [...g.vehicles]) if (v.kitTest && v !== P().inVehicle) g.vehiclesSys.remove(v);
    for (const d of [...(g.dogs?.dogs ?? [])]) if (d.kitTest) { d.dead = true; d.owned = false; const i = g.dogs.dogs.indexOf(d); if (i >= 0) g.dogs.dogs.splice(i, 1); }
    g.gadgets.list.length = 0; K.winchLine = null;
  };
  const home = async (x, z) => {
    if (g.dialogue?.active) g.dialogue.close();
    g.driveOverride = null;
    const v = P().inVehicle; if (v) { g.exitVehicle(true); if (v.kitTest) g.vehiclesSys.remove(v); }
    await C('teleport', { x, z });
  };
  // A clear 80 m line (nothing solid along it, no water).
  const stretch = () => {
    // Out of Rust Haven (|x|, |z| < 88) and well clear of its people: staged raiders and driven rigs never meet the town.
    for (const [x, z, h] of [[-260, -100, 0], [0, -200, Math.PI / 2], [-60, -260, 0], [200, 100, 0], [140, -150, Math.PI / 2], [-180, 60, 0]]) {
      const fx = Math.sin(h), fz = Math.cos(h), ax = Math.cos(h), az = -Math.sin(h);
      let ok = true;
      for (const o of [-4, 0, 4]) if (!g.statics.lineOfSight(x + ax * o - fx * 40, z + az * o - fz * 40, x + ax * o + fx * 40, z + az * o + fz * 40)) { ok = false; break; }
      if (ok && !g.water?.depthAt(x, z)) return { x, z, h, fx, fz, ax, az };
    }
    return null;
  };
  const raider = (x, z) => { const r = g.spawnRaider(x, z, Math.random, 'pistol'); mark(r); r.hold = true; r.weapon = null; return r; }; // unarmed unless a check arms him
  const lightCount = () => { let n = 0; g.scene.traverse((o) => { if (o.isLight) n++; }); return n; };
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9;
  was.slots = g.inventory.carried.slots.splice(0); g.inventory.changed?.(); // an empty pack: only what each check gives
  K.staged = false;
  try {
    await check('kit: every row is whole (slots, the cells and filters that feed it, the heat ramp climbs and has no purple, the air zones, the dog gear, the car kit) and every piece is a thing you carry', async () => {
      const bad = [...validateKit(undefined, ITEMS).bad, ...validateDogGear().bad, ...validateWorkshop().bad, ...validateKnowledge().errors];
      for (const id of [...KITS, ...Object.keys(CELLS), ...Object.keys(DOG_GEAR)]) if (!ITEMS[id]) bad.push(`${id}: no item`);
      for (const id of KITS) if (ITEMS[id]?.use?.act !== 'kit') bad.push(`${id}: use act`);
      for (const id of Object.keys(DOG_GEAR)) if (ITEMS[id]?.use?.act !== 'doggear') bad.push(`${id}: use act`);
      // Found, never made from nothing: every cell, filter and powered piece turns up in some loot table (law 2).
      const found = new Set(Object.values(LOOT).flatMap((t) => t.rows.map((r) => r[0])));
      for (const id of ['battery_cell', 'mask_filter', 'nvg', 'thermal_scope', 'gas_mask', 'binoculars', 'flashlight']) if (!found.has(id)) bad.push(`${id}: in no loot table`);
      return bad.length ? bad.slice(0, 8).join('; ') : true;
    });

    const S = stretch();
    if (!S) { await check('kit: open ground to stage on', async () => 'no clear 80 m stretch'); return; }

    await check('kit: night goggles drain their cell by the second (a fresh cell thumbed in from the pack when it goes flat), the world grade steps aside for their own picture, and a flare 6 m off whites them out; they come back once it is gone', async () => {
      clean(); await home(S.x, S.z); await C('setTime', { hour: 1 });
      const L0 = lightCount();
      K.on.eyes = null; g.inventory.stow('nvg', 1); g.inventory.stow('battery_cell', 1); K.charge.nvg = 6;
      K.on.eyes = 'nvg';
      await C('step', { seconds: 3 });
      const drained = K.charge.nvg < 4 && K.charge.nvg > 2;
      await C('step', { seconds: 4 }); // past the first cell: the spare goes in
      const swapped = K.carried('battery_cell') === 0 && K.charge.nvg > KIT.nvg.power.life - 3;
      g.render(0); const on = K.mul.visible && g.renderer.toneMappingExposure > K.baseExposure * 1.5;
      const gradeOff = !g.look || g.look.strength() === 0; // the world's colour grade steps aside for the tubes' own picture (systems/lookfeel.js)
      const f = g.gadgets.place('signal_flare', S.x + S.fx * 6, S.z + S.fz * 6, 0, P(), { state: 'armed', armAt: 0 });
      let blind = 0; for (let k = 0; k < 6; k++) { await C('step', { seconds: 0.25 }); blind = Math.max(blind, K.blind); }
      g.gadgets.remove(f);
      await C('step', { seconds: 4 });
      const back = K.blind < 0.15;
      K.charge.nvg = 0.5; await C('step', { seconds: 1.5 }); g.render(0); // flat, no cells left: the picture goes
      const dead = !K.mul.visible;
      K.on.eyes = null; g.render(0);
      const lights = lightCount() === L0, gradeBack = !g.look || !(g.look.settings.grade > 0) || g.look.strength() > 0;
      return drained && swapped && on && gradeOff && gradeBack && blind >= 0.6 && back && dead && lights ? true : `drained=${drained} swapped=${swapped} (cells ${K.carried('battery_cell')}, charge ${r1(K.charge.nvg)}) on=${on} grade off=${gradeOff} back=${gradeBack} blind=${r1(blind)} back=${back} (${r1(K.blind)}) dead=${dead} lights=${lights}`;
    });

    await check('kit: a lit flashlight at night makes a raider 46 m off spot you (unlit he does not); with no torch carried the beam does not come on at all', async () => {
      clean(); await home(S.x, S.z); await C('setTime', { hour: 1 });
      g.inventory.stow('flashlight', 1); K.charge.flashlight = 600; K.on.beam = 'auto';
      const r = raider(S.x + S.fx * 46, S.z + S.fz * 46); r.weapon = 'pistol';
      g.flashOverride = false; P().hidden = false;
      for (let k = 0; k < 8; k++) { await C('step', { seconds: 0.25 }); if (r.target === P()) break; }
      const unlit = r.target === P();
      r.target = null; r.state = 'idle';
      g.flashOverride = true;
      let lit = false; for (let k = 0; k < 8 && !lit; k++) { await C('step', { seconds: 0.25 }); lit = r.target === P(); }
      const mul = K.seenMul(); r.weapon = null; // spotted is enough: he shoots nobody
      g.inventory.spend('flashlight', 1); await C('step', { seconds: 0.2 });
      const noTorch = (g.flashMat?.opacity ?? 0) === 0;
      g.flashOverride = was.fo;
      return !unlit && lit && mul > 1.4 && noTorch ? true : `unlit spotted=${unlit} lit spotted=${lit} seenMul=${mul} beam without a torch=${g.flashMat?.opacity}`;
    });

    await check('kit: binoculars mark the raider in the open in their cone and NOT the one behind a building (line of sight), and lift the camera out along the aim', async () => {
      clean();
      // A building between you and one of them; the other in the open off to the side.
      let stage = null;
      for (const b of g.statics.boxes) {
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, w = b.maxX - b.minX, d = b.maxZ - b.minZ;
        if (w < 6 || d < 6 || w > 30 || d > 30 || (b.maxY ?? 3) < 2 || Math.hypot(cx, cz) > 400 || (Math.abs(cx) < 130 && Math.abs(cz) < 130)) continue; // not in town
        for (const a0 of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
          const fx = Math.sin(a0), fz = Math.cos(a0), e = Math.max(w, d) / 2;
          const px = cx - fx * (e + 30), pz = cz - fz * (e + 30), bx = cx + fx * (e + 3), bz = cz + fz * (e + 3);
          const ax = px + Math.sin(a0 + 0.3) * 45, az = pz + Math.cos(a0 + 0.3) * 45;
          if (g.statics.lineOfSight(px, pz, bx, bz) || !g.statics.lineOfSight(px, pz, ax, az) || g.water?.depthAt(px, pz) || g.statics.inside?.(px, pz)) continue;
          if (!g.statics.lineOfSight(px, pz, px + fx * 2, pz + fz * 2)) continue;
          stage = { px, pz, bx, bz, ax, az, a0 }; break;
        }
        if (stage) break;
      }
      if (!stage) return 'no building to hide behind';
      await home(stage.px, stage.pz); await C('setTime', { hour: 12 });
      const A = raider(stage.ax, stage.az), B = raider(stage.bx, stage.bz); A.weapon = null; B.weapon = null;
      A.marked = 0; B.marked = 0;
      if (!g.statics.lineOfSight(P().x, P().z, A.x, A.z) || g.statics.lineOfSight(P().x, P().z, B.x, B.z)) return `staging: los A ${g.statics.lineOfSight(P().x, P().z, A.x, A.z)} B ${g.statics.lineOfSight(P().x, P().z, B.x, B.z)}`;
      g.inventory.stow('binoculars', 1);
      const L = await C('kit', { look: true, aim: stage.a0 + 0.15 });
      if (L.ok === false) return L.error;
      await C('step', { seconds: 1 });
      const cam = g.droneCam.active && g.droneCam.h >= KIT.binoculars.h && Math.hypot(g.droneCam.x - P().x, g.droneCam.z - P().z) > 30;
      const a = A.marked > g.time, b = B.marked > g.time;
      await C('kit', { look: false });
      const off = !g.droneCam.active;
      return a && !b && cam && off ? true : `in the open marked=${a}; behind the wall marked=${b}; camera out=${cam} (${r1(g.droneCam.h)}) released=${off}`;
    });

    await check('kit: the radio scanner hears a convoy only after its lead actually keys up, inside range, while the scanner is on; switched off it hears nothing', async () => {
      clean(); await home(0, -40); await C('setTime', { hour: 12 });
      const k = g.pulls.k; k.holder('player', { x: P().x, z: P().z });
      g.inventory.stow('radio_scanner', 1); g.inventory.stow('battery_cell', 2); K.charge.radio_scanner = 0;
      K.on.ears = 'radio_scanner';
      const mine = () => (k.holders.get('player')?.facts ?? []).filter((c) => c.subject === 'convoy' && c.source?.channel === 'scanner');
      const n0 = mine().length;
      g.convoy.spawn(1);
      await C('step', { seconds: 0.5 });
      const before = mine().length - n0; // it has not said anything yet
      await C('step', { seconds: 2.5 });
      const heard = mine().length - n0, keyed = K.lastKeyUp;
      K.on.ears = null; K.convoyT = 0;
      await C('step', { seconds: 0.5 });
      const offHeard = mine().length - n0 - heard, keyed2 = K.lastKeyUp?.fact !== keyed?.fact;
      g.convoy.despawn?.(); g.convoy.next = 1e9;
      return before === 0 && heard === 1 && keyed2 && offHeard === 0 && K.carried('battery_cell') === 1 ? true : `before=${before} heard=${heard} (lead key-up ${JSON.stringify(keyed)}) second key-up=${keyed2} heard with it off=${offHeard} cells=${K.carried('battery_cell')}`;
    });

    await check('kit: the heat scope shows a shambler COLD and a raider white-hot; a fresh corpse is still warm and an old one has gone cold; drawn as one instanced mesh, no new light', async () => {
      clean(); await home(S.x, S.z); await C('setTime', { hour: 22 });
      const L0 = lightCount();
      const live = raider(S.x + S.fx * 10, S.z + S.fz * 10);
      const z = mark(g.addChar({ x: S.x + S.fx * 20, z: S.z + S.fz * 20, faction: 'zombie', name: 'Test Shambler', flag: 'US' })); z.hold = true;
      const fresh = raider(S.x - S.fx * 10, S.z - S.fz * 10), old = raider(S.x - S.fx * 20, S.z - S.fz * 20); // all on the clear line: in sight
      for (const c of [fresh, old]) { c.alive = false; c.hp = 0; }
      fresh.deadTime = 10; old.deadTime = 4000;
      g.inventory.stow('thermal_scope', 1); K.charge.thermal_scope = 100; K.on.eyes = 'thermal_scope';
      await C('step', { seconds: 0.2 }); g.render(0);
      const T = (c) => K.heatOf(c), air = K.airC(), probe = new Color();
      const hl = (t) => { const c = K.rampColor(t, probe); return 0.3 * c.r + 0.6 * c.g + 0.1 * c.b; };
      const cold = T(z) < air + 3, hot = T(live) >= 36.5, warm = T(fresh) > 34, gone = T(old) < air + 1;
      const drawn = K.heatMesh.visible && K.heatMesh.count >= 5, brightLive = hl(T(live)) > 0.6, darkDead = hl(T(z)) < 0.25;
      K.on.eyes = null; g.render(0);
      const lights = lightCount() === L0;
      return cold && hot && warm && gone && drawn && brightLive && darkDead && lights ? true : `shambler ${r1(T(z))} (air ${r1(air)}) raider ${r1(T(live))} fresh ${r1(T(fresh))} old ${r1(T(old))} drawn=${K.heatMesh.count} bright=${r1(hl(T(live)))} dark=${r1(hl(T(z)))} lights=${lights}`;
    });

    await check('kit: a gas mask with a filter keeps you breathing on chemical ground; without one THE TANK FARM hurts you (and the filter drains while it works)', async () => {
      clean(); const Z = CHEM_ZONES[0];
      await home(Z.x, Z.z); await C('setTime', { hour: 12 });
      if (K.airAt(P()) !== 'chem') return `not in the zone (${K.airAt(P())}) at ${r1(P().x)},${r1(P().z)}`;
      const god = g.godMode; g.godMode = false; P().hp = P().maxHp ?? 100;
      try {
        const h0 = P().hp, c0 = K.counts.choked;
        await C('step', { seconds: 2 });
        const hurt = h0 - P().hp, choked = K.counts.choked - c0;
        P().hp = h0;
        g.inventory.stow('gas_mask', 1); g.inventory.stow('mask_filter', 1); K.charge.gas_mask = 0;
        await C('step', { seconds: 2 });
        const safe = P().hp >= h0 - 0.01 && K.masked, drained = K.charge.gas_mask < KIT.gas_mask.power.life && K.carried('mask_filter') === 0;
        return hurt > 5 && choked > 0 && safe && drained ? true : `without a mask: -${r1(hurt)} hp (${choked} ticks); with one: hp ${r1(P().hp)}/${r1(h0)} masked=${K.masked} filter ${r1(K.charge.gas_mask)} left ${K.carried('mask_filter')}`;
      } finally { g.godMode = god; P().hp = P().maxHp ?? 100; g.inventory.spend('gas_mask', K.carried('gas_mask')); }
    });

    await check('kit: the nitrous burst spends a bottle from its tank (3 -> 2), shoves the car on and burns a flame out the back; with the tank empty Shift does nothing', async () => {
      clean(); await home(S.x - S.fx * 30 + S.ax * 3, S.z - S.fz * 30 + S.az * 3);
      const r = await C('spawnVehicle', { type: 'interceptor', x: S.x - S.fx * 30, z: S.z - S.fz * 30, heading: S.h });
      const v = g.vehicles.find((c) => c.id === r.id); v.kitTest = true;
      const fit = g.garage.addUtility(v, 'nitrous'); if (!fit.ok) return `fit: ${fit.why}`;
      g.garage.addUtility(v, 'spotlight');
      await C('enterVehicle', { id: r.id, force: true });
      await C('drive', { throttle: 1, seconds: 1.2 });
      const c0 = v.utility.nitrous.charges, s0 = g.vehiclesSys.speed(v);
      await C('drive', { throttle: 1, boost: true, seconds: 0.5 });
      g.render(0);
      const flame = K.glow.visible && K.glow.count >= 2, burning = v.nitroUntil > g.time;
      await C('drive', { throttle: 1, seconds: 1.2 });
      const s1 = g.vehiclesSys.speed(v), c1 = v.utility.nitrous.charges;
      v.utility.nitrous.charges = 0; v.boostWas = false;
      await C('drive', { throttle: 1, seconds: 2.6 });
      await C('drive', { throttle: 1, boost: true, seconds: 0.4 });
      const none = !(v.nitroUntil > g.time) && v.utility.nitrous.charges === 0;
      g.exitVehicle(true);
      return c0 - c1 === 1 && burning && flame && s1 > s0 && none ? true : `tank ${c0}->${c1} burning=${burning} flame=${flame} (${K.glow.count}) speed ${r1(s0)}->${r1(s1)} empty-boost-none=${none}`;
    });

    await check('kit: the harpoon winch pulls the hooked car\'s near door off on the yank, and a winch hooked to a door pulls it down when you drive away', async () => {
      clean(); await home(S.x - S.ax * 4, S.z - S.az * 4);
      const r = await C('spawnVehicle', { type: 'rig', x: S.x, z: S.z, heading: S.h });
      const v = g.vehicles.find((c) => c.id === r.id); v.kitTest = true;
      const fit = g.garage.addUtility(v, 'winch'); if (!fit.ok) return `fit: ${fit.why}`;
      const t = await C('spawnVehicle', { type: 'sedan', x: S.x + S.fx * 14, z: S.z + S.fz * 14, heading: S.h + Math.PI / 2 }); // up the clear line, broadside
      const tv = g.vehicles.find((c) => c.id === t.id); tv.kitTest = true;
      await C('enterVehicle', { id: r.id, force: true });
      g.vehiclesSys.fireHarpoon(v, Math.atan2(tv.x - v.x, tv.z - v.z));
      for (let k = 0; k < 10 && g.vehiclesSys.harpoon?.state !== 'attached'; k++) await C('step', { seconds: 0.1 });
      if (g.vehiclesSys.harpoon?.state !== 'attached') return `harpoon ${g.vehiclesSys.harpoon?.state ?? 'gone'}`;
      g.vehiclesSys.fireHarpoon(v, 0); // again: the yank
      await C('step', { seconds: 0.3 });
      const off = Object.keys(tv.dmg.off).filter((p) => p.startsWith('door'));
      g.exitVehicle(true);
      // A door: the winch car backed up to it, then driven away.
      const I = g.interiors, nobody = (x) => !g.chars.some((c) => c.alive && c.npc && Math.hypot(c.x - x.x, c.z - x.z) < 40), d = I.doors.filter((x) => !x.broken && x.kind !== 'inner' && Math.hypot(x.x, x.z) > 140 && nobody(x) && g.statics.lineOfSight(x.x + x.nx * 2, x.z + x.nz * 2, x.x + x.nx * 24, x.z + x.nz * 24) && g.statics.lineOfSight(x.x + x.nx * 2 + x.nz * 2, x.z + x.nz * 2 - x.nx * 2, x.x + x.nx * 24 + x.nz * 2, x.z + x.nz * 24 - x.nx * 2)).sort((a, b) => Math.hypot(a.x - S.x, a.z - S.z) - Math.hypot(b.x - S.x, b.z - S.z))[0];
      if (!d) return `car door off: ${off}; no door to pull`;
      const h = Math.atan2(d.nx, d.nz), sx = d.x + d.nx * 7, sz = d.z + d.nz * 7;
      g.vehiclesSys.remove(tv);
      v.x = sx; v.z = sz; v.h = h; v.vx = v.vz = 0; v.group?.position.set(sx, v.group.position.y, sz);
      await C('teleport', { x: sx + Math.cos(h) * 3, z: sz - Math.sin(h) * 3 });
      await C('enterVehicle', { id: r.id, force: true });
      const hooked = K.hookDoor(v, d.x, d.z, 3);
      let pulled = false; for (let k = 0; k < 8 && !pulled; k++) { await C('drive', { throttle: 1, seconds: 0.5 }); pulled = !!d.pulled; }
      g.exitVehicle(true);
      return off.length >= 1 && hooked && pulled ? true : `car doors off: ${off.join(',') || 'none'}; door hooked=${!!hooked} pulled=${pulled} (car ${r1(Math.hypot(v.x - d.x, v.z - d.z))} m off)`;
    });

    await check('kit: hub spikes shred the tyre of a car you rub alongside (the side facing you)', async () => {
      clean(); await home(S.x - S.fx * 30 + S.ax * 6, S.z - S.fz * 30 + S.az * 6);
      const r = await C('spawnVehicle', { type: 'interceptor', x: S.x - S.fx * 22, z: S.z - S.fz * 22, heading: S.h });
      const v = g.vehicles.find((c) => c.id === r.id); v.kitTest = true; g.garage.addUtility(v, 'hubspikes');
      const o = await C('spawnVehicle', { type: 'sedan', x: S.x + S.ax * 2.6, z: S.z + S.az * 2.6, heading: S.h });
      const ov = g.vehicles.find((c) => c.id === o.id); ov.kitTest = true;
      const n0 = K.counts.slashed;
      await C('enterVehicle', { id: r.id, force: true });
      await C('drive', { throttle: 0.7, seconds: 3.4 });
      g.exitVehicle(true);
      const flats = Object.entries(ov.dmg.tyres).filter(([, k]) => k <= 0).map(([w]) => w);
      const side = flats.length && flats.every((w) => w.endsWith(flats[0].slice(-1)));
      return K.counts.slashed > n0 && side ? true : `slashed ${K.counts.slashed - n0}, flats ${flats.join(',') || 'none'}, cars ${r1(Math.hypot(v.x - ov.x, v.z - ov.z))} m apart`;
    });

    await check('kit: the bark collar marks the raider your dog actually sensed (inside its threat reach) and not one it never did; the vest soaks a share of every hurt', async () => {
      clean(); await home(S.x, S.z); await C('setTime', { hour: 12 });
      const breed = Object.keys(BREEDS)[0], d = g.dogs.make(breed, S.x + 1.5, S.z, { name: 'Test Rex' }); d.kitTest = true; d.bond = 30; g.dogs.adopt(d);
      g.inventory.stow('bark_collar', 1); g.inventory.stow('dog_vest', 1);
      const r1x = K.dress('bark_collar', d), r2x = K.dress('dog_vest', d);
      if (!r1x.ok || !r2x.ok) return `dress: ${r1x.why ?? ''} ${r2x.why ?? ''}`;
      const reach = d.p.threatR;
      const near = raider(S.x + S.fx * reach * 0.5, S.z + S.fz * reach * 0.5), far = raider(S.x + S.fx * (reach + 25), S.z + S.fz * (reach + 25));
      near.marked = 0; far.marked = 0; near.weapon = null; far.weapon = null; near.target = P(); // hostile to you: the dog reads it as a threat
      for (let k = 0; k < 12 && !(near.marked > g.time); k++) await C('step', { seconds: 0.25 });
      const a = near.marked > g.time, b = far.marked > g.time;
      const hp0 = d.hp; g.dogs.hurt(d, 20, null); const took = hp0 - d.hp;
      return a && !b && Math.abs(took - 20 * (1 - DOG_GEAR.dog_vest.soak)) < 0.01 ? true : `sensed one marked=${a}; the far one marked=${b} (reach ${reach}); a 20 hurt took ${r1(took)}`;
    });
  } finally {
    clean();
    K.staged = was.staged; K.on = was.on; K.charge = was.charge; K.aimOverride = undefined; K.endLook(); K.blind = 0;
    g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.conv; g.flashOverride = was.fo;
    g.inventory.carried.slots.length = 0; g.inventory.carried.slots.push(...was.slots); g.inventory.changed?.();
    g.render(0);
    await C('setTime', { hour: 12 });
    await C('teleport', { x: 0, z: -40 });
  }
}
