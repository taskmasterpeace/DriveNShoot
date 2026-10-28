// GADGETS, DRONES, TOWN SECURITY and the door verbs as COMMANDS rows (docs/design/WEB_GADGETS.md; systems/gadgets.js,
// systems/drones.js, systems/security.js, data/gadgets.js). buildCommands() in api.js spreads these into COMMANDS, so
// help, the CLI, the MCP tools and docs/COMMANDS.md see them like any other row. gadgetsChecks is the selftest share.
import { GADGETS, DRONES, BARRICADES, SECURITY, SECURITY_TIERS } from '../data/gadgets.js';
import { ITEMS } from '../data/items.js';

const r1 = (v) => Math.round(v * 10) / 10;
const KINDS = Object.keys(GADGETS);

export function gadgetsCommands(api, need) {
  const g = api.g;
  const P = () => g.player;
  const GX = () => g.gadgets;
  const where = (at, heading) => {
    const p = P();
    if (at === undefined || at === 'feet') return { x: p.x + Math.sin(p.face) * 1.1, z: p.z + Math.cos(p.face) * 1.1, h: heading ?? p.face };
    if (at === 'aim') return { x: g.aim.x, z: g.aim.z, h: heading ?? Math.atan2(g.aim.x - p.x, g.aim.z - p.z) };
    const m = String(at).split(',').map(Number);
    need(m.length === 2 && m.every(Number.isFinite), 'at= x,z (e.g. at=12,-40), aim or feet');
    return { x: m[0], z: m[1], h: heading ?? Math.atan2(m[0] - p.x, m[1] - p.z) };
  };
  const door = (id) => {
    const I = g.interiors;
    if (!id || id === 'nearest') { const d = GX().doorInReach(P()) ?? I.doors.filter((x) => !x.broken).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z))[0]; need(d, 'no door near you'); return d; }
    const d = I.byId.get(id); need(d, `no door ${id}; doors near you: the doors command`); return d;
  };

  return {
    gadget: {
      group: 'world', desc: `Gadgets (data/gadgets.js, docs/design/WEB_GADGETS.md): ${KINDS.join(', ')}. No args: every gadget in the world near you (radius, default 120 m) with its state (flying, arming, armed, tripped, burning), trigger, what it sits on, who it is hunting, the factions that have spotted it, and the counts. place=<kind> at=x,z|aim|feet heading= (radians; a chain, strip or wire lies ACROSS the heading) sets one as yours (owner=none: nobody's); throw=<kind> x= z= throws one in an arc from where you stand (or out of the car window); attach=<kind> target=<vehicle id | door id> fixes a car alarm or a breach charge; detonate=true sets off your remote charges (id= just one; the U key); pickup=<id> takes one back; give=<kind> n= puts them in your pack; craft=<kind> makes one from what you carry (its row's recipe); id=<gadget id> views one; clear=true takes every gadget away. armed=true skips the arm time (staging).`,
      args: { place: { type: 'string', enum: KINDS }, throw: { type: 'string', enum: KINDS }, attach: { type: 'string', enum: ['car_alarm', 'breach_charge'] }, at: { type: 'string' }, heading: { type: 'number' }, x: { type: 'number' }, z: { type: 'number' }, target: { type: 'string' },
        owner: { type: 'string', enum: ['player', 'none'], default: 'player' }, armed: { type: 'boolean', default: false }, detonate: { type: 'boolean' }, id: { type: 'string' }, pickup: { type: 'string' }, give: { type: 'string' }, n: { type: 'number', default: 1 }, craft: { type: 'string' }, clear: { type: 'boolean' }, radius: { type: 'number', default: 120 } },
      run: async (a) => {
        const S = GX(), p = P(), own = a.owner === 'none' ? null : p;
        if (a.clear) { const n = S.list.length; S.list.length = 0; return { cleared: n }; }
        if (a.give) { need(ITEMS[a.give] && (GADGETS[a.give] || a.give.startsWith('drone_') || ['planks', 'door_wedge', 'key_ring', 'door_key'].includes(a.give)), `give= one of ${[...KINDS, ...Object.keys(DRONES).map((k) => `drone_${k}`), 'planks', 'door_wedge', 'key_ring', 'door_key'].join(', ')}`); return { gave: g.inventory.stow(a.give, a.n), item: a.give, carried: g.inventory.carried.count(a.give) }; }
        if (a.craft) { const r = S.craft(a.craft); need(r.ok, r.why); return r; }
        if (a.detonate) return { detonated: S.detonate(p, a.id ?? null) };
        if (a.pickup) { const t = S.byId(a.pickup); need(t, `no gadget ${a.pickup}`); const r = S.pickUp(t, p); need(r.ok, r.why); return r; }
        if (a.place) {
          const w = where(a.x !== undefined && a.z !== undefined ? `${a.x},${a.z}` : a.at, a.heading);
          const t = S.place(a.place, w.x, w.z, w.h, own, a.armed ? { state: 'armed', armAt: 0 } : {});
          need(t.ok !== false, t.why);
          return { gadget: S.view(t) };
        }
        if (a.throw) {
          need(Number.isFinite(a.x) && Number.isFinite(a.z), 'throw needs x= z=');
          need(GADGETS[a.throw].verb === 'throw', `the ${GADGETS[a.throw].name.toLowerCase()} is ${GADGETS[a.throw].verb}d, not thrown`);
          const t = S.throwOne(a.throw, p, a.x, a.z);
          return { gadget: S.view(t) };
        }
        if (a.attach) {
          let tgt = null;
          if (a.target) tgt = g.vehicles.find((v) => v.id === a.target) ?? g.interiors.byId.get(a.target) ?? null;
          if (a.target) need(tgt, `no vehicle or door ${a.target}`);
          const t = S.attach(a.attach, p, tgt);
          need(t.ok !== false, t.why);
          return { gadget: S.view(t) };
        }
        if (a.id) { const t = S.byId(a.id); need(t, `no gadget ${a.id}`); return { gadget: S.view(t) }; }
        const near = S.list.filter((t) => Math.hypot(t.x - p.x, t.z - p.z) <= a.radius).map((t) => S.view(t));
        return { gadgets: near, total: S.list.length, barricades: S.barred.map((b) => ({ door: b.door.id, kind: b.kind, lockHp: Math.round(b.door.lockHp), held: r1(g.time - b.at) })), counts: { ...S.counts }, kinds: Object.fromEntries(KINDS.map((k) => [k, { name: GADGETS[k].name, verb: GADGETS[k].verb, trigger: GADGETS[k].trigger, carried: g.inventory.carried.count(k) }])) };
      },
    },
    drone: {
      group: 'world', desc: `Drones (data/gadgets.js DRONES: ${Object.keys(DRONES).join(', ')}; systems/drones.js). No args: the one in the air (state fly|home|down, where, distance from you, signal 0..1, battery s, hp, bombs) and the counts. action=launch kind= (give=true puts one in your pack first; it leaves the pack and flies, your body stays put, the camera follows it); action=fly x= z= flies it to a point (or dx= dz= -1..1 holds a direction like WASD; boost=true); action=land calls it home (it lands beside you and goes back in the pack); action=bomb drops one (the drop drone). Past its range the signal goes and it flies itself home. In the game: launch it from the PACK screen; WASD fly, Shift boost, E home, U drop.`,
      args: { action: { type: 'string', enum: ['launch', 'fly', 'land', 'bomb', 'view'], default: 'view' }, kind: { type: 'string', default: 'scout', enum: Object.keys(DRONES) }, give: { type: 'boolean', default: false }, x: { type: 'number' }, z: { type: 'number' }, dx: { type: 'number' }, dz: { type: 'number' }, boost: { type: 'boolean', default: false } },
      run: async ({ action, kind, give, x, z, dx, dz, boost }) => {
        const D = g.drones;
        if (action === 'launch') {
          const item = `drone_${kind}`;
          if (give && !g.inventory.carried.count(item)) g.inventory.stow(item, 1);
          const i = g.inventory.carried.slots.findIndex((s) => s.id === item);
          need(i >= 0, `no ${DRONES[kind].name.toLowerCase()} in your pack (give=true)`);
          const r = g.inventory.use(i);
          need(r.ok, r.why);
          return { launched: kind, drone: D.view() };
        }
        need(D.d || action === 'view', 'no drone in the air (action=launch)');
        if (action === 'fly') {
          if (Number.isFinite(x) && Number.isFinite(z)) D.goTo(x, z);
          else D.steer(dx ?? 0, dz ?? 0, boost);
          return { drone: D.view() };
        }
        if (action === 'land') { D.recall('called home'); return { drone: D.view() }; }
        if (action === 'bomb') { const r = D.dropBomb(); need(r.ok, r.why); return { ...r, drone: D.view() }; }
        return { drone: D.view() };
      },
    },
    security: {
      group: 'society', desc: `Town security and THE PAPER LADDER (data/gadgets.js SECURITY, SECURITY_TIERS: ${Object.keys(SECURITY_TIERS).join(' -> ')}; systems/security.js). No args: each town's station, its patrol car and beat, the responses out (tier, mode drive|out|arrest|fight|leave, their cars and men), the roadblocks, an arrest on offer, counts. tier=<bulls|posse|tracers> sends that rung now (town= ${Object.keys(SECURITY).join('|')}); roadblock=true sets one across the road ahead of you; surrender=true takes the cuffs on offer (fine if you can pay, the cell if not); ambient=false/true turns the patrol car and the beat off/on; auto=false stops the stars sending anyone; clear=true sends everyone home.`,
      args: { tier: { type: 'string', enum: Object.keys(SECURITY_TIERS) }, town: { type: 'string', enum: Object.keys(SECURITY) }, roadblock: { type: 'boolean' }, surrender: { type: 'boolean' }, ambient: { type: 'boolean' }, auto: { type: 'boolean' }, clear: { type: 'boolean' } },
      run: async ({ tier, town, roadblock, surrender, ambient, auto, clear }) => {
        const S = g.security;
        if (ambient !== undefined) S.ambient = ambient;
        if (auto !== undefined) S.auto = auto;
        const T = town ? S.towns.find((t) => t.id === town) : null;
        if (clear) { for (const r of S.responses) S.retire(r); S.responses.length = 0; for (const b of S.blocks) S.clearBlock(b); S.blocks.length = 0; S.arrest = null; }
        if (tier) { const r = S.dispatch(tier, 'command', T); need(r.ok, r.why); }
        if (roadblock) S.roadblock(T ?? S.townNear(P().x, P().z));
        if (surrender) { const r = S.surrender(); need(r.ok, r.why); return { ...r, security: S.view() }; }
        return S.view();
      },
    },
    barricade: {
      group: 'world', desc: `Hold a door shut, or open it with a key (data/gadgets.js BARRICADES: ${Object.keys(BARRICADES).join(', ')}; systems/gadgets.js). door=<id | nearest> kind= adds the barricade's hp and kicks to the door's lock (a wedge or planks come out of your pack; give=true puts one there; furniture needs nothing). remove=true takes it down from your side. key=true turns the lock with a key you carry (the bull's key ring, or a door key for that door; give=true gives a ring): locks a shut door, unlocks a locked one, quietly. Reports the door's lockHp and kicks after.`,
      args: { door: { type: 'string', default: 'nearest' }, kind: { type: 'string', default: 'planks', enum: Object.keys(BARRICADES) }, remove: { type: 'boolean' }, key: { type: 'boolean' }, give: { type: 'boolean', default: false } },
      run: async ({ door: id, kind, remove, key, give }) => {
        const d = door(id), S = GX();
        if (key) { if (give && !g.inventory.hasTag('keys')) g.inventory.stow('key_ring', 1); const r = S.keyTurn(d, P(), true); need(r.ok, r.why); return { ...r, door: g.interiors.doorView(d) }; }
        if (remove) { const r = S.unbarricade(d, P()); need(r.ok, r.why); return { ...r, door: g.interiors.doorView(d) }; }
        const B = BARRICADES[kind];
        if (give && B.needs && !g.inventory.carried.count(B.needs)) g.inventory.stow(B.needs, 1);
        const r = S.barricade(d, kind, P(), true);
        need(r.ok, r.why);
        return { ...r, door: g.interiors.doorView(d) };
      },
    },
  };
}

// ---- the selftest share ---------------------------------------------------------------------------------------------
// Every check stages on open ground west of town, with the dead, the wolves and the convoys held off, and puts the
// battery's state back after (security's auto and ambient stay off for the rest of the battery, as runSelfTest set them).
export async function gadgetsChecks(api, check, C) {
  const g = api.g, P = () => g.player, GX = g.gadgets;
  const quiet = () => { const was = { z: g.zombies.enabled, r: g.raiderTimer, conv: g.convoy.next }; g.zombies.enabled = false; g.raiderTimer = 1e9; g.convoy.despawn?.(); g.convoy.next = 1e9; return () => { g.zombies.enabled = was.z; g.raiderTimer = was.r; g.convoy.next = was.conv; }; };
  const home = async (x, z) => {
    if (g.dialogue?.active) g.dialogue.close();
    g.driveOverride = null;
    if (g.drones.d) { g.drones.d = null; g.drones.piloting = false; }
    const v = P().inVehicle; if (v) { g.exitVehicle(true); g.vehiclesSys.remove(v); }
    await C('teleport', { x, z });
  };
  // A stretch of open ground: a 70 m straight line with nothing in the way, near (x0, z0), along +z or +x.
  const stretch = () => {
    for (const [x, z, h] of [[-120, -20, 0], [-180, 60, 0], [140, -150, Math.PI / 2], [0, -200, Math.PI / 2], [-60, -260, 0], [200, 100, 0], [-260, -100, 0]]) {
      const fx = Math.sin(h), fz = Math.cos(h), ax = Math.cos(h), az = -Math.sin(h);
      let ok = true;
      for (const o of [-4, 0, 4]) if (!g.statics.lineOfSight(x + ax * o - fx * 40, z + az * o - fz * 40, x + ax * o + fx * 40, z + az * o + fz * 40)) { ok = false; break; }
      if (ok && !g.water?.depthAt(x, z)) return { x, z, h, fx, fz, ax, az };
    }
    return null;
  };
  const clean = () => { GX.list.length = 0; for (const c of [...g.chars]) if (c.gadgetTest) g.removeChar(c); for (const v of [...g.vehicles]) if (v.gadgetTest && v !== P().inVehicle) g.vehiclesSys.remove(v); };
  const restore = quiet();
  const sAuto = g.security.auto, sAmb = g.security.ambient;
  try {
    await check('gadgets: every row is whole (verb, trigger, effect, who it hurts, how the AI notices it, weight, a craft or buy source) and is a thing you carry; drones too; every recipe names real items', async () => {
      const bad = [];
      for (const [k, r] of Object.entries(GADGETS)) {
        if (!['throw', 'place', 'attach'].includes(r.verb) || !r.trigger || !r.effect || !r.hurts || !r.notice?.tell || !(r.item?.kg > 0) || !(r.source?.craft || r.source?.buy)) bad.push(`${k}: row`);
        if (ITEMS[k]?.kind !== 'gadget' || ITEMS[k].use?.act !== 'gadget') bad.push(`${k}: item`);
        for (const [id] of r.source?.craft ?? []) if (!ITEMS[id]) bad.push(`${k}: recipe ${id}`);
      }
      for (const k of Object.keys(DRONES)) if (ITEMS[`drone_${k}`]?.kind !== 'drone') bad.push(`drone_${k}`);
      return bad.length ? bad.join(', ') : KINDS.length >= 14 ? true : `${KINDS.length} rows`;
    });

    const S = stretch();
    if (!S) { await check('gadgets: open ground to stage on', async () => 'no clear 80 m stretch found'); return; }

    await check('gadgets: a road chain thrown across the road pops the tyres of a car driven over it (vehicledamage.popTyre)', async () => {
      clean(); await home(S.x - S.fx * 30 + S.ax * 3, S.z - S.fz * 30 + S.az * 3);
      // Throw it from the roadside, 25 m up the road: it lands lying across the throw, so throw it across the road.
      await C('teleport', { x: S.x + S.ax * 6, z: S.z + S.az * 6 });
      const t = GX.throwOne('road_chain', P(), S.x, S.z);
      await C('step', { seconds: 1.6 });
      if (t.state !== 'armed') return `chain ${t.state} at ${r1(t.x)},${r1(t.z)}`;
      const sx = S.x - S.fx * 36, sz = S.z - S.fz * 36;
      await C('teleport', { x: sx + S.ax * 3, z: sz + S.az * 3 });
      const r = await C('spawnVehicle', { type: 'interceptor', x: sx, z: sz, heading: S.h });
      const v = g.vehicles.find((c) => c.id === r.id); v.gadgetTest = true;
      await C('enterVehicle', { id: r.id, force: true });
      const across = Math.abs((t.x - S.x) * S.ax + (t.z - S.z) * S.az);
      await C('drive', { throttle: 1, seconds: 3.2 });
      const flats = Object.entries(v.dmg.tyres).filter(([, k]) => k <= 0).map(([w]) => w);
      g.exitVehicle(true);
      return flats.length >= 2 ? true : `flats=${flats} chain off-line ${r1(across)} m, hits=${t.hits.size}, car at ${r1(v.x)},${r1(v.z)}`;
    });

    await check('gadgets: an AI driver who sees a strip in the road in daylight brakes or steers round it (gadgetAvoided), and its tyres stay whole', async () => {
      clean(); await C('setTime', { hour: 12 });
      await home(S.x + S.ax * 8, S.z + S.az * 8);
      const t = GX.place('spike_strip', S.x, S.z, S.h, P(), { state: 'armed', armAt: 0 });
      const sx = S.x - S.fx * 32, sz = S.z - S.fz * 32;
      const v = g.vehiclesSys.spawn('interceptor', sx, sz, S.h, '#4a3a2a'); v.gadgetTest = true; v.ai = 'gadgetTest';
      const d = g.addChar({ x: sx, z: sz, faction: 'drifter', name: 'Test Driver', flag: 'US' }); d.gadgetTest = true; g.seats.board(d, v, 0);
      v.vx = S.fx * 12; v.vz = S.fz * 12;
      let avoided = 0; const n0 = GX.counts.avoided;
      v.throttle = 0.8;
      for (let k = 0; k < 30; k++) { await C('step', { seconds: 0.1 }); avoided = GX.counts.avoided - n0; }
      const flats = Object.values(v.dmg.tyres).filter((k) => k <= 0).length;
      const passed = (v.x - S.x) * S.fx + (v.z - S.z) * S.fz;
      return avoided > 0 && flats === 0 ? true : `avoided=${avoided} flats=${flats} along=${r1(passed)} strip=${t.state}`;
    });

    await check('gadgets: a crawler mine set down walks to a staged raider 15 m off and kills it inside 8 s', async () => {
      clean(); await home(S.x - S.fx * 6, S.z - S.fz * 6);
      const r = g.spawnRaider(S.x + S.fx * 15, S.z + S.fz * 15, Math.random, 'pistol'); r.gadgetTest = true; r.hold = true; r.weapon = null;
      const t = GX.place('crawler_mine', S.x, S.z, S.h, P(), { state: 'armed', armAt: 0 });
      let at = null;
      for (let k = 0; k < 16 && r.alive; k++) { await C('step', { seconds: 0.5 }); if (!r.alive) at = (k + 1) * 0.5; }
      return !r.alive && at <= 8 ? true : `raider ${r.alive ? `alive hp ${Math.round(r.hp)}` : 'dead late'}; crawler ${GX.list.includes(t) ? `${t.state} at ${r1(t.x)},${r1(t.z)} hunting ${t.hunt?.id}` : 'gone'}`;
    });

    await check('gadgets: a pressure mine buried in the road kills the car that drives over it (it burns, its tyres go)', async () => {
      clean(); await home(S.x + S.ax * 10, S.z + S.az * 10);
      const t = GX.place('landmine', S.x, S.z, S.h, null, { state: 'armed', armAt: 0 });
      const sx = S.x - S.fx * 25, sz = S.z - S.fz * 25;
      const r = await C('spawnVehicle', { type: 'interceptor', x: sx, z: sz, heading: S.h });
      const v = g.vehicles.find((c) => c.id === r.id); v.gadgetTest = true;
      await C('teleport', { x: sx + S.ax * 3, z: sz + S.az * 3 });
      await C('enterVehicle', { id: r.id, force: true });
      await C('drive', { throttle: 1, seconds: 2.6 });
      const gone = !GX.list.includes(t);
      if (P().inVehicle) g.exitVehicle(true);
      await C('step', { seconds: 0.5 });
      const killed = v.dead || v.onFire > 0 || v.hp <= 0;
      return gone && killed ? true : `mine ${gone ? 'went' : t.state}; car hp ${Math.round(v.hp)} onFire ${v.onFire} dead ${v.dead} at ${r1(v.x)},${r1(v.z)}`;
    });

    await check('gadgets: a fan mine fires down its own facing when a raider walks through its wire, and not at whoever stands behind it', async () => {
      clean(); await home(S.x - S.fx * 8 + S.ax * 6, S.z - S.fz * 8 + S.az * 6);
      const t = GX.place('fan_mine', S.x, S.z, S.h, P(), { state: 'armed', armAt: 0 });
      const behind = g.spawnRaider(S.x - S.fx * 4, S.z - S.fz * 4, Math.random, 'pistol'); behind.gadgetTest = true; behind.hold = true; behind.weapon = null;
      const r = g.spawnRaider(S.x + S.fx * 1.1 + S.ax * 0.2, S.z + S.fz * 1.1 + S.az * 0.2, Math.random, 'pistol'); r.gadgetTest = true; r.hold = true; r.weapon = null;
      await C('step', { seconds: 0.4 });
      return !GX.list.includes(t) && !r.alive && behind.alive ? true : `mine ${GX.list.includes(t) ? t.state : 'fired'}; in front ${r.alive ? 'alive' : 'dead'}; behind ${behind.alive ? 'alive' : 'dead'}`;
    });

    await check('gadgets: a remote charge waits for the detonate (U) and a flare burns on the pooled lights (the light count never changes)', async () => {
      clean(); await home(S.x - S.fx * 14, S.z - S.fz * 14);
      let lights = 0; g.scene.traverse((o) => { if (o.isLight) lights++; });
      const t = GX.place('remote_charge', S.x, S.z, S.h, P(), { state: 'armed', armAt: 0 });
      await C('step', { seconds: 2 });
      const waited = GX.list.includes(t);
      const n = GX.detonate(P());
      const f = GX.place('signal_flare', S.x + S.ax * 5, S.z + S.az * 5, 0, P(), { state: 'armed', armAt: 0 });
      await C('step', { seconds: 1 });
      const lit = f.state === 'burning' && f.lit > 0 && g.fx.lights.some((L) => L.life > 0 && Math.abs(L.l.position.x - f.x) < 0.5);
      let lights2 = 0; g.scene.traverse((o) => { if (o.isLight) lights2++; });
      return waited && n === 1 && lit && lights === lights2 ? true : `waited=${waited} n=${n} lit=${lit} lights ${lights}->${lights2}`;
    });

    await check('drones: a scout drone flown past its range loses the signal, flies itself home and lands back in the pack; it marks the raiders it flies over', async () => {
      clean(); await home(S.x, S.z);
      const raider = g.spawnRaider(S.x + S.fx * 30, S.z + S.fz * 30, Math.random, 'pistol'); raider.gadgetTest = true; raider.hold = true; raider.weapon = null;
      const kept = g.inventory.carried.slots.splice(0); // an empty pack: a battery's worth of loot leaves no room for it
      try {
      const L = await C('drone', { action: 'launch', kind: 'scout', give: true });
      const D = g.drones;
      if (!D.d) return `launch: ${L.error ?? JSON.stringify(L).slice(0, 200)}`;
      const R = D.d.def.range;
      if (!D.piloting) return 'not piloting after launch';
      const camOn = g.droneCam.active || (await C('step', { seconds: 0.1 }), g.droneCam.active);
      await C('drone', { action: 'fly', x: S.x + S.fx * 30, z: S.z + S.fz * 30 });
      await C('step', { seconds: 3 });
      const marked = raider.marked > g.time;
      // Out past the range, straight up the road (a point well beyond it).
      await C('drone', { action: 'fly', x: S.x + S.fx * (R + 80), z: S.z + S.fz * (R + 80) });
      let lost = false, maxD = 0;
      for (let k = 0; k < 70 && D.d; k++) { await C('step', { seconds: 0.5 }); if (D.d) { maxD = Math.max(maxD, Math.hypot(D.d.x - P().x, D.d.z - P().z)); if (D.d.why === 'signal lost') lost = true; } }
      const back = !D.d && g.inventory.carried.count('drone_scout') === 1;
      return camOn && marked && lost && back && maxD <= R + 20 ? true : `cam=${camOn} marked=${marked} lost=${lost} back=${back} maxD=${r1(maxD)} range=${R} state=${D.d?.state}`;
      } finally { g.inventory.spend('drone_scout', g.inventory.carried.count('drone_scout')); g.inventory.carried.slots.push(...kept); g.inventory.changed(); }
    });

    await check('security: a theft a town bull saw raises a star and brings the run-down patrol car from the station to you', async () => {
      clean(); g.security.auto = true; g.wanted = 0; g.security.lastWanted = 0;
      const T = g.security.towns[0], st = g.security.stationOf(T);
      // The scene: 60 m from the station, a bull 6 m off looking at you.
      const a = Math.atan2(-st.x, -st.z), x = st.x + Math.sin(a) * 60, z = st.z + Math.cos(a) * 60;
      await home(x, z);
      const w = g.addChar({ x: x + 5, z, faction: 'warden', weapon: 'pistol', name: 'Test Bull', flag: 'MX' }); w.gadgetTest = true; w.hold = true; w.face = -Math.PI / 2;
      const n0 = g.security.counts.dispatched;
      g.society.deeds.record('steal', { x, z, m: 2, tf: 'rusthaven', stars: 1, label: 'a shelf' });
      const stars = g.wanted;
      await C('step', { seconds: 0.2 });
      const resp = g.security.responses[g.security.responses.length - 1];
      if (!resp || g.security.counts.dispatched === n0) return `stars=${stars}; nothing dispatched`;
      const car = resp.cars[0];
      let near = Infinity;
      for (let k = 0; k < 40; k++) { await C('step', { seconds: 0.5 }); near = Math.min(near, Math.hypot(car.x - P().x, car.z - P().z)); if (near < 22) break; }
      const rundown = car.type === 'bullcar' && car.look === 'rundown';
      return stars >= 1 && near < 22 && rundown ? true : `stars=${stars} car ${car.type} nearest ${r1(near)} m mode=${resp.mode}`;
    });

    await check('security: hands up beside the bulls (holstered, still) ends it with a fine; the stars go to zero', async () => {
      const S2 = g.security;
      g.cash = Math.max(g.cash, 500);
      for (let k = 0; k < 30 && !S2.arrest; k++) await C('step', { seconds: 0.5 });
      if (!S2.arrest) return `no arrest offered (modes ${S2.responses.map((r) => r.mode)})`;
      g.arms.holster('test');
      const c0 = g.cash;
      for (let k = 0; k < 20 && S2.arrest; k++) { P().speed = 0; await C('step', { seconds: 0.5 }); }
      return !S2.arrest && g.wanted === 0 && g.cash < c0 ? true : `arrest=${!!S2.arrest} wanted=${g.wanted} cash ${c0}->${g.cash}`;
    });

    await check('security: a roadblock (posse) puts two bull cars across the road and a chain between them', async () => {
      clean(); await home(S.x - S.fx * 40, S.z - S.fz * 40);
      const b = g.security.roadblock(g.security.towns[0], 'posse', { x: S.x, z: S.z, h: S.h });
      const ok = b.cars.length === 2 && b.cars.every((v) => v.type === 'bullcar') && GX.list.includes(b.chain) && b.chain.def.trigger === 'tyre';
      g.security.clearBlock(b); g.security.blocks = g.security.blocks.filter((x) => x !== b);
      return ok ? true : `cars=${b.cars.length} chain=${!!b.chain}`;
    });

    await check('doors: planks across a locked door hold four of the infected beating on it for 25 s (the same door with nothing on it gives first)', async () => {
      clean();
      const I = g.interiors;
      const pick = I.doors.filter((d) => !d.broken && d.kind !== 'inner' && d.leaves.length === 1 && d.material === 'wood' && !GX.barred.some((b) => b.door === d)).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
      const [d1, d2] = pick;
      if (!d2) return 'no two single wooden doors';
      const out = (d, k) => ({ x: d.x + d.nx * (0.9 + (k % 2) * 0.5) + d.ux * ((k >> 1) - 0.5) * 0.6, z: d.z + d.nz * (0.9 + (k % 2) * 0.5) + d.uz * ((k >> 1) - 0.5) * 0.6 });
      const test = async (d, bar) => {
        for (const b of GX.barred.filter((x) => x.door === d)) GX.unbarricade(d);
        I.setLocked(d, true);
        if (bar) GX.barricade(d, 'planks', null, false);
        const zs = [];
        g.zombies.enabled = true;
        for (let k = 0; k < 4; k++) { const p = out(d, k); const c = g.addChar({ x: p.x, z: p.z, faction: 'zombie', name: 'Test Infected', flag: 'US' }); if (c) { c.gadgetTest = true; c.wx = d.x - d.nx * 3; c.wz = d.z - d.nz * 3; zs.push(c); } }
        await home(d.x - d.nx * 3, d.z - d.nz * 3);
        g.player.hidden = false;
        for (const c of zs) c.ztarget = g.player;
        let t = 0;
        while (d.locked && t < 25) { await C('step', { seconds: 0.5 }); t += 0.5; }
        g.zombies.enabled = false;
        for (const c of zs) g.removeChar(c);
        const held = d.locked;
        for (const b of GX.barred.filter((x) => x.door === d)) GX.unbarricade(d); I.setLocked(d, false);
        return { held, t, hp: Math.round(d.lockHp) };
      };
      const plain = await test(d2, false), barred = await test(d1, true);
      return barred.held && !plain.held ? true : `barred held=${barred.held} (${barred.t}s); plain held=${plain.held} (${plain.t}s)`;
    });
  } finally {
    clean();
    restore();
    g.security.auto = sAuto; g.security.ambient = sAmb;
    g.wanted = 0; g.security.lastWanted = 0; g.security.arrest = null;
    for (const r of g.security.responses) g.security.retire(r); g.security.responses.length = 0;
    if (g.drones.d) { g.drones.d = null; g.drones.piloting = false; }
    if (P().inVehicle) g.exitVehicle(true);
    await C('teleport', { x: 0, z: -40 });
  }
}
