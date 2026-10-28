// THE UNDERGROUND for agents (docs/design/WEB_UNDERGROUND.md): the `underground` and `generator` commands, and the
// selftest's underground checks (run inside runSelfTest, agent/api.js, with its check() and command caller; every check
// returns true or a JSON diagnostic).
import { planSite, genLevel, clearCache, asciiMap } from '../world/undergen.js';
import { UG, LOGS, LIGHT, validateUnderground } from '../data/underground.js';
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import GOLDEN from '../data/golden.json';

const r1 = (v) => Math.round(v * 10) / 10;

export function undergroundCommands(api, need) {
  const g = api.g;
  const site = (id) => { const s = g.under.byId.get(id); need(s, `no site "${id}" (underground lists them)`); return s; };
  // Stand at a site: its entrance's top on the street (level 0), or where you come in on level k. Far sites stream first.
  const enter = async (s, level = 0) => {
    const U = g.under, P = g.player;
    if (P.inVehicle) g.exitVehicle(true);
    if (Math.hypot(s.x - P.x, s.z - P.z) > 200) await api.call('teleport', { x: s.x, z: s.z });
    U.place(s);
    const row = U.rowOf(s), plan = planSite(row);
    need(level >= 0 && level <= plan.n, `levels 0..${plan.n}`);
    U.activate(s);
    if (!level) {
      const t = plan.flights[0].top, f = plan.flights[0];
      P.x = t.x - f.u * (f.axis === 'x' ? 1.2 : 0); P.z = t.z - f.u * (f.axis === 'x' ? 0 : 1.2); P.gy = 0; P.storey = null; P.ug = null;
    } else {
      U.promote(level);
      U.A.wantT.set(level, g.time);
      const L = genLevel(row, level);
      P.x = L.arrival.x; P.z = L.arrival.z; P.gy = L.y; P.storey = null;
    }
    g.standOn(P);
    P.face = plan.flights[0].axis === 'x' ? (plan.flights[0].u > 0 ? Math.PI / 2 : -Math.PI / 2) : plan.flights[0].u > 0 ? 0 : Math.PI;
    g.camLook.x = P.x; g.camLook.z = P.z; g.camFloor = P.gy; g.camLook.y = 0;
    g.updateCamera(0.016);
    return { site: s.id, level, x: r1(P.x), z: r1(P.z), gy: r1(P.gy), ug: P.ug ?? null };
  };
  return {
    underground: {
      group: 'world',
      desc: 'Caves, bunker levels and the secret facilities (docs/design/WEB_UNDERGROUND.md; rows in data/underground.js, levels made by world/undergen.js). No args: every site (id, name, kind, entrance, where, levels, project, holdout, distance, attached, live, power) and what is live now (the site, its promoted levels, your level, the clip). id=: one site in full - its frame and floor heights, every flight, the lift, its record (alert, codes learned, logs read, roofs down) and each level (hash, the NavProbe proof, rooms, doors with their locks and keypads, boxes, logs, the generator, the nest, who lives there). action=enter id= level=<k>: stand at its entrance on the street (level 0) or where you come in on level k (far sites stream first). action=map id= level=: the level as text (# rock . floor ~ pool w deep = stair O hole L lift + door B blast door g generator c box s soldier z infected D drone ? log). action=proof: every site\'s every level made and proved (rooms reached from the entrance, the way down, the lift) and the rows validated. action=read log=<id>: read a log on your level (force=true from anywhere on it). action=keypad door=<id>: key in the code (it must be learned and the power on). action=lift to=<stop>: send the lift (0 = the street). action=power on=: stage the site\'s power.',
      args: { id: { type: 'string' }, action: { type: 'string', default: 'list', enum: ['list', 'info', 'enter', 'map', 'proof', 'read', 'keypad', 'lift', 'power'] }, level: { type: 'number', default: 0 }, log: { type: 'string' }, door: { type: 'string' }, to: { type: 'number' }, on: { type: 'boolean' }, force: { type: 'boolean', default: false } },
      run: async ({ id, action, level, log, door, to, on, force }) => {
        const U = g.under;
        if (action === 'list' && !id) return { ...U.status(), list: U.sites.map((s) => U.siteView(s)).sort((a, b) => a.dist - b.dist) };
        if (action === 'proof') {
          const t0 = performance.now(), bad = [], hashes = {};
          let n = 0;
          for (const s of U.sites) for (let k = 1; k <= s.levels; k++) { const L = genLevel(U.rowOf(s), k); n++; hashes[`${s.id}:${k}`] = L.hash; if (!L.proof.ok) bad.push(`${s.id}:${k} ${L.proof.unreached.join(',')}`); }
          return { sites: U.sites.length, levels: n, unproved: bad, rows: validateUnderground(U.sites, ITEMS), ms: Math.round(performance.now() - t0), sample: Object.fromEntries(Object.entries(hashes).slice(0, 6)) };
        }
        if (action === 'enter') return enter(site(id), level);
        if (action === 'map') { const s = site(id ?? U.A?.site.id), k = level || U.levelOf(g.player.gy) || 1; const L = genLevel(U.rowOf(s), k); return { site: s.id, level: k, ox: L.ox, oz: L.oz, y: L.y, map: asciiMap(L), legend: '# rock . floor ~ pool w deep = stair O hole L lift + door B blast g generator c box s soldier z infected D drone ? log' }; }
        if (action === 'read') {
          need(U.A && g.player.ug, 'go down first (underground action=enter id= level=)');
          const P = U.A.levels.get(U.levelOf(g.player.gy)), L = P?.logs.find((q) => q.id === log);
          need(L, `no log "${log}" on this level (logs: ${P?.logs.map((q) => q.id).join(', ')})`);
          need(force || Math.hypot(L.x - g.player.x, L.z - g.player.z) < 2, `the log is at ${L.x}, ${L.z}: go there (moveTo) or force=true`);
          return U.readLog(P, L);
        }
        if (action === 'keypad') {
          need(U.A, 'no site is live');
          let d = null; for (const P of U.A.levels.values()) d ??= P.doors.find((q) => q.id === door);
          need(d, `no live door "${door}"`);
          return U.keypad(d, g.player);
        }
        if (action === 'lift') { need(U.A, 'no site is live'); return U.callLift(to ?? 0); }
        if (action === 'power') { need(U.A, 'no site is live'); U.setPower(!!on, 'staged'); if (on && U.A.rec.fuel <= 0) U.A.rec.fuel = 0.5; return { power: U.A.rec.power, fuel: U.A.rec.fuel }; }
        return U.siteView(site(id ?? U.A?.site.id), true);
      },
    },
    generator: {
      group: 'world',
      desc: 'The live site\'s generator (the underground, docs/design/WEB_UNDERGROUND.md): where it is, power, fuel, what it lights and moves (strips, keypads, terminals, the lift). action=start: crank it as E does (from beside it, or force=true; a dry tank takes a fuel can from your pack); action=stop; fuel=<0..1> stages the tank.',
      args: { action: { type: 'string', default: 'status', enum: ['status', 'start', 'stop'] }, fuel: { type: 'number' }, force: { type: 'boolean', default: false } },
      run: async ({ action, fuel, force }) => {
        const U = g.under, A = U.A;
        need(A, 'no site is live: go to one (underground action=enter)');
        if (fuel !== undefined) A.rec.fuel = Math.max(0, Math.min(1, fuel));
        let where = null;
        for (let k = 1; k <= A.plan.n; k++) { const L = genLevel(A.row, k); if (L.generator) where = { level: k, x: L.generator.x, z: L.generator.z, y: L.y }; }
        if (action === 'start') {
          need(where, 'this site has no generator');
          const p = g.player;
          need(force || (p.ug && U.levelOf(p.gy) === where.level && Math.hypot(where.x - p.x, where.z - p.z) < 2.6), `the generator is on level ${where.level} at ${where.x}, ${where.z}: go there or force=true`);
          const r = U.startGenerator(force ? { x: where.x, z: where.z, gy: where.y } : p);
          need(r.ok, r.why);
        }
        if (action === 'stop') U.setPower(false, 'stopped');
        return { site: A.site.id, generator: where, power: A.rec.power, fuel: +A.rec.fuel.toFixed(2), lift: A.plan.lift ? { stop: A.rec.lift.stop, y: r1(A.rec.lift.y), target: A.rec.lift.target } : null };
      },
    },
  };
}
void UG; void LOGS; void LIGHT; void clearCache;

// ---- the selftest (docs/design/WEB_UNDERGROUND.md §8) ----------------------------------------------------------------
export async function undergroundChecks({ api, g, check, C }) {
  const U = g.under, p = g.player;
  const keyFor = (dx, dz) => (Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 'KeyD' : 'KeyA') : dz > 0 ? 'KeyS' : 'KeyW');
  const holdKey = async (code, seconds, until) => { g.input.down.add(code); g.input.pressed.add(code); try { for (let f = 0; f < seconds * 60; f++) { await api._step(1); if (until?.()) break; } } finally { g.input.down.delete(code); } };
  const site = (id) => U.byId.get(id);
  // Staged: god on, nobody about on the street round the entrance, the flashlight as the key left it.
  // Outpost Nine's own sentries stand down (calm, held at their posts) while its cellar is staged: the street's trespass
  // rule is the base's checks' business, and a sentry chasing you down the hatch would join the holdout below.
  const baseHold = (on) => { const B = g.bases?.byId?.outpost9; if (!B) return; if (on) g.bases.calm(B, 'staged', true); for (const c of B.guards) c.hold = on ? true : 0; };
  const stage = async (id, level, clearR = 45) => {
    g.flashOverride = undefined; g.aimOverride = null; g.autopilot = null;
    await C('standing', { faction: 'remnant', set: 0 });
    baseHold(true);
    const r = await C('underground', { action: 'enter', id, level });
    for (const c of [...g.chars]) if (c !== p && !c.ug && !c.npc && !c.baseId && !c.res && (c.faction === 'raider' || c.faction === 'drifter' || c.faction === 'zombie') && Math.hypot(c.x - p.x, c.z - p.z) < clearR) g.removeChar(c);
    await api._step(3);
    return r;
  };
  const home = async () => {
    g.flashOverride = undefined; g.aimOverride = null;
    baseHold(false);
    if (U.A) U.deactivate();
    p.gy = 0; p.ug = null;
    await C('teleport', { x: 0, z: -40 });
    await api._step(3);
  };
  // The mean brightness of the game camera's frame (0..255 by luma), rendered small.
  const luma = () => {
    const r = g.renderer, rt = new THREE.WebGLRenderTarget(320, 180);
    rt.texture.colorSpace = THREE.SRGBColorSpace; // what the screen shows, not the linear buffer
    g.updateCamera(0);
    r.setRenderTarget(rt); r.render(g.scene, g.camera);
    const px = new Uint8Array(320 * 180 * 4); r.readRenderTargetPixels(rt, 0, 0, 320, 180, px);
    r.setRenderTarget(null); rt.dispose();
    let s = 0; for (let i = 0; i < px.length; i += 4) s += 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
    return +(s / (320 * 180)).toFixed(2);
  };

  await check('underground: the rows validate, and every level of every site (the authored ones, the atlas\'s sealed places, the fifty bases) is made and proved by NavProbe - every room or chamber, the way down and the lift reached from where you come in', async () => {
    const r = await C('underground', { action: 'proof' });
    return r.ok && !r.unproved.length && !r.rows.length && r.levels >= 120 && r.sites >= 60 ? true : JSON.stringify({ unproved: r.unproved?.slice(0, 6), rows: r.rows?.slice(0, 6), levels: r.levels, sites: r.sites });
  });

  await check('underground: a level is a pure function of its row - the same seed makes the same level (hash), another seed another one; the island\'s golden hash has not moved', async () => {
    const s = site('outpost9_deep'), a = genLevel(s, 1).hash, b = genLevel(s, 2).hash;
    clearCache();
    const a2 = genLevel(s, 1).hash, b2 = genLevel(s, 2).hash, c = genLevel({ ...s, seed: s.seed + 1 }, 1).hash;
    clearCache();
    const golden = g.streamer.islandHash === GOLDEN.islandHash;
    return a === a2 && b === b2 && c !== a && golden ? true : JSON.stringify({ a, a2, b, b2, c, island: g.streamer.islandHash, golden: GOLDEN.islandHash });
  });

  await check('underground: walk down Outpost Nine\'s hatch on held keys - under the street you are below (ug), at the foot you stand on level 1, only it is drawn (the street clipped off over your ceiling, the occluder under your floor, no sun); and back up the same way to the street as it was', async () => {
    await stage('outpost9_deep', 0);
    const f = U.A.plan.flights[0], down = f.axis === 'x' ? keyFor(f.u, 0) : keyFor(0, f.u), up = f.axis === 'x' ? keyFor(-f.u, 0) : keyFor(0, -f.u);
    let wentUg = false;
    await holdKey(down, 9, () => { if (p.ug) wentUg = true; return p.gy <= f.yBot + 0.01 && Math.hypot(p.x - f.bottom.x, p.z - f.bottom.z) < 0.7; });
    await api._step(20);
    const P1 = U.A.levels.get(1), others = [...U.A.levels.values()].filter((P) => P.k !== 1);
    const below = { gy: +p.gy.toFixed(2), ug: p.ug, level: U.levelOf(p.gy), clip: +U.clip.constant.toFixed(2), shown: P1?.look.group.visible, othersHidden: others.every((P) => !P.look.group.visible), occluder: U.occluder.visible, street: U.A.T.ent.group.visible, sun: +g.sky.sun.intensity.toFixed(3), below: g.sky.below };
    const okBelow = wentUg && below.ug === 'outpost9_deep' && below.level === 1 && Math.abs(below.gy - f.yBot) < 0.02 && below.clip <= p.gy + UG.clipMin + 0.01 && below.clip < 0 && below.shown && below.othersHidden && below.occluder && !below.street && below.sun < 0.05;
    await holdKey(up, 9, () => p.gy >= -0.001 && !p.ug && Math.hypot(p.x - f.top.x, p.z - f.top.z) < 1.2);
    await api._step(20);
    const above = { gy: +p.gy.toFixed(2), ug: p.ug ?? null, clip: U.clip.constant, street: U.A?.T.ent.group.visible ?? true, below: g.sky.below };
    await home();
    return okBelow && above.gy === 0 && !above.ug && above.clip > 1e5 && above.street && above.below === 0 ? true : JSON.stringify({ wentUg, below, above });
  });

  await check('underground: it is dark below - Red Rock Cave\'s first level with the flashlight off is near black, with it on it reads (the cone and its spill)', async () => {
    await stage('redrock_cave', 1);
    p.face = Math.PI / 2;
    g.flashOverride = false; await api._step(30);
    const off = luma();
    g.flashOverride = true; await api._step(30);
    const on = luma();
    await home();
    return off < 4 && on > off * 2.5 && on > 6 ? true : JSON.stringify({ off, on });
  });

  await check('underground: a locked blast door blocks until it is opened - the Lull\'s vault, walked into on held keys, holds; with the power on and its code read from the duty officer\'s card, the keypad opens it and you walk through', async () => {
    await stage('the_lull', 3);
    const P = U.A.levels.get(3), d = P.doors.find((q) => q.blast && q.keypad === 'vault');
    if (!d) { await home(); return 'no vault door on the Lull\'s third level'; }
    const out = (x, z) => (x - d.x) * d.nx + (z - d.z) * d.nz;
    p.x = d.x + d.nx * 1.6; p.z = d.z + d.nz * 1.6; g.standOn(p);
    for (const c of P.occ) if (c.alive && Math.hypot(c.x - d.x, c.z - d.z) < 14) c.hold = true; // the dead stand still for the staging
    const into = keyFor(-d.nx, -d.nz);
    await holdKey(into, 2);
    const held = out(p.x, p.z) > 0.2 && d.locked;
    const refused = U.keypad(d, p); // no power, no code
    U.A.rec.fuel = 0.6; U.setPower(true, 'staged');
    const card = P.logs.find((l) => LOGS[l.id].code === 'vault');
    const read = card ? U.readLog(P, card) : null;
    const opened = U.keypad(d, p);
    p.x = d.x + d.nx * 1.6; p.z = d.z + d.nz * 1.6;
    await holdKey(into, 3, () => out(p.x, p.z) < -1.2);
    const through = out(p.x, p.z) < -1.0;
    for (const c of P.occ) c.hold = 0;
    U.setPower(false, 'staged');
    await home();
    return held && !refused.ok && read?.ok && opened.ok && !d.locked && through ? true : JSON.stringify({ held, refused, read: !!read?.ok, opened, locked: d.locked, through, out: out(p.x, p.z) });
  });

  await check('underground: restoring the Lull\'s generator (hold E beside it, a fuel can poured into the dry tank) lights the strip lights and the keypads and runs the freight lift, which would not move before', async () => {
    await stage('the_lull', 2);
    const A = U.A, P = A.levels.get(2), G = P.L.generator;
    if (!G) { await home(); return 'no generator on the Lull\'s second level'; }
    U.setPower(false, 'staged'); A.rec.fuel = 0;
    const deadLift = U.callLift(0);
    const stripAt = P.look.stripItems.findIndex((it) => it.kind === 'strip'), col = new THREE.Color();
    P.look.strips.getColorAt(stripAt, col); const dark = col.getHexString();
    const worn = g.inventory.worn; g.inventory.wear('ruck'); // room for a can
    g.inventory.add(g.inventory.carried, 'fuel_can', 1, { left: 1 }); g.inventory.changed();
    p.x = G.x + (G.x > (P.L.ox + P.L.W / 2) ? -1.9 : 1.9); p.z = G.z; g.standOn(p);
    for (const c of P.occ) if (c.alive && Math.hypot(c.x - G.x, c.z - G.z) < 8) { c.x = P.L.arrival.x; c.z = P.L.arrival.z; c.hold = true; } // the dead out of the way for the staging
    g.input.down.delete('KeyE'); await api._step(2); // E up first: a fresh press
    const prompts = [], pr = g.hud.prompt; g.hud.prompt = (t) => { if (t && prompts.length < 4 && !prompts.includes(t)) prompts.push(t); return pr.call(g.hud, t); };
    try { await holdKey('KeyE', 4, () => A.rec.power); } finally { g.hud.prompt = pr; }
    const powered = A.rec.power, fuel = A.rec.fuel;
    P.look.strips.getColorAt(stripAt, col); const lit = col.getHexString();
    const y0 = A.rec.lift.y, call = U.callLift(A.plan.n - 1);
    await api._step(60 * 6);
    const y1 = A.rec.lift.y, arrived = A.rec.lift.stop === A.plan.n - 1 && A.rec.lift.target === null;
    U.setPower(false, 'staged');
    for (const c of P.occ) c.hold = 0;
    if (worn) g.inventory.wear(worn);
    await home();
    return !deadLift.ok && powered && fuel > 0.3 && dark !== lit && lit === new THREE.Color(LIGHT.strip).getHexString() && call.ok && Math.abs(y1 - y0) > 3 && arrived ? true : JSON.stringify({ deadLift, powered, fuel, dark, lit, call, y0, y1, arrived, prompts, cans: g.inventory.carried.count('fuel_can') });
  });

  await check('underground: a level remembers - what you took from a box and who you killed down there stay so after you leave (the level written back) and come back (promoted again)', async () => {
    await stage('redrock_cave', 1);
    const A = U.A, P = A.levels.get(1), inv = g.inventory, b = P.L.boxes[0];
    const box = inv.boxes.get(b.id);
    if (!box) { await home(); return 'no box on the cave\'s first level'; }
    inv.open(box);
    while (!box.slots.length) inv.add(box, 'flare', 1);
    const took = box.slots[0].id, n0 = box.count(took);
    inv.move(box, 0, inv.carried, 1);
    const n1 = box.count(took);
    const victim = P.occ.find((c) => c.alive && c.faction === 'zombie');
    if (victim) await C('kill', { id: victim.id });
    const vi = victim?.ugOcc?.i;
    await home(); // far away: the site goes down, its levels written back
    const gone = !U.A;
    await stage('redrock_cave', 1);
    const P2 = U.A.levels.get(1), box2 = inv.boxes.get(b.id), back = P2.occ.find((c) => c.ugOcc?.i === vi);
    const res = { gone, took, n0, n1, n2: box2?.count(took), victimDead: victim ? P2.lr.occ[vi]?.alive === false && !back : true };
    await home();
    return gone && n1 === n0 - 1 && res.n2 === n1 && res.victimDead ? true : JSON.stringify(res);
  });

  await check('underground: everything below survives a save and a load - standing on the Lull\'s second level with its power on, a door kicked in, a code learned: load puts you back on that level with all of it', async () => {
    await stage('the_lull', 2);
    const A = U.A, P = A.levels.get(2);
    A.rec.fuel = 0.7; U.setPower(true, 'staged');
    const d = P.doors[0]; g.interiors.unlock(d, 'staged', p, true);
    U.learn(A.site, 'ward');
    await api._step(5);
    const x = p.x, z = p.z, gy = p.gy;
    const sv = (await C('save')).save;
    await home(); U.recs.get('the_lull').power = false;
    const r = await C('load', { save: sv });
    await api._step(5);
    const A2 = U.A, P2 = A2?.levels.get(2), d2 = P2?.doors.find((q) => q.id === d.id);
    const res = { ok: r.ok, live: A2?.site.id, ug: p.ug, level: U.levelOf(p.gy), at: Math.hypot(p.x - x, p.z - z) < 0.1 && Math.abs(p.gy - gy) < 0.05, power: A2?.rec.power, door: d2 ? d2.locked : 'missing', codes: A2?.rec.codes };
    if (A2) U.setPower(false, 'staged');
    await home();
    return res.ok && res.live === 'the_lull' && res.ug === 'the_lull' && res.level === 2 && res.at && res.power && res.door === false && res.codes?.includes('ward') ? true : JSON.stringify(res);
  });

  await check('underground: Outpost Nine\'s holdout - soldiers with service rifles at their posts, a drone flying its corridor; a trespasser in sight is challenged once, then shot at', async () => {
    await stage('outpost9_deep', 1);
    const A = U.A, P = A.levels.get(1);
    const soldiers = P.occ.filter((c) => c.ugRole === 'soldier' && c.alive), drone = P.occ.find((c) => c.ugRole === 'drone');
    const armed = soldiers.every((c) => c.weapon === 'rifle' || c.weapon === 'smg');
    // the drone flies its round (watched by someone the Remnant counts a friend: it lets them be)
    p.x = A.plan.flights[0].bottom.x; p.z = A.plan.flights[0].bottom.z; // where you come in
    const d0 = drone ? { x: drone.x, z: drone.z } : null;
    let flew = 0;
    if (drone) { await C('standing', { faction: 'remnant', set: 50 }); await api._step(60 * 4); flew = Math.hypot(drone.x - d0.x, drone.z - d0.z); await C('standing', { faction: 'remnant', set: 0 }); } // a friend of the Remnant: the bird lets you be and flies its round
    // in sight of a post: in the room the first soldier keeps, at its middle
    A.rec.alert = 'calm';
    const s = soldiers.find((c) => P.L.rooms.some((r) => c.x > r.x0 && c.x < r.x1 && c.z > r.z0 && c.z < r.z1)) ?? soldiers[0];
    const room = P.L.rooms.find((r) => s.x > r.x0 && s.x < r.x1 && s.z > r.z0 && s.z < r.z1);
    p.x = room ? (room.x0 + room.x1) / 2 : s.x; p.z = room ? (room.z0 + room.z1) / 2 : s.z; g.standOn(p);
    await api._step(30);
    const warned = A.rec.alert === 'warned' || A.rec.alert === 'hostile';
    await api._step(60 * (UG.below ? 7 : 7));
    const hostile = A.rec.alert === 'hostile', aimed = soldiers.some((c) => c.target === p);
    await home();
    return soldiers.length >= 4 && armed && drone && flew > 2 && warned && hostile && aimed ? true : JSON.stringify({ soldiers: soldiers.length, armed, drone: !!drone, flew, warned, hostile, aimed, alert: A.rec.alert });
  });

  await check('underground: sound carries down the corridors, not up through the earth - a shot below turns the cave\'s dead toward it and not one stood on the street right over it; a shot on the street there reaches nobody below', async () => {
    await stage('redrock_cave', 1);
    const A = U.A, P = A.levels.get(1);
    // a listener of our own in the chamber farthest from where you come in (dry floor), the shot fired a few metres off in
    // the same chamber (a gunshot's 45 m); one of the dead stood on the street right over the listener
    const L = P.L, open = (x, z) => { const q = U.cellOf(P, x, z); return q >= 0 && P.walk[q] === 1; };
    const ch = [...(L.chambers ?? [])].filter((o) => open(o.x, o.z)).sort((a, b) => Math.hypot(b.x - L.arrival.x, b.z - L.arrival.z) - Math.hypot(a.x - L.arrival.x, a.z - L.arrival.z))[0];
    if (!ch) { await home(); return 'no dry chamber on the cave\'s first level'; }
    let sx = ch.x, sz = ch.z;
    for (let a = 0; a < 6.28; a += 0.5) { const x = ch.x + Math.cos(a) * 3.5, z2 = ch.z + Math.sin(a) * 3.5; if (open(x, z2)) { sx = x; sz = z2; break; } }
    const z = g.zombies.spawn(ch.x, ch.z, false);
    z.x = ch.x; z.z = ch.z; z.gy = L.y; z.ug = A.site.id; z.ztarget = null; z.zt = 99; z.wx = z.x; z.wz = z.z; z.timer = 99;
    const top = g.zombies.spawn(z.x, z.z, false); top.gy = 0; top.ug = null; top.wx = top.x; top.wz = top.z; top.timer = 99;
    p.x = sx; p.z = sz; g.standOn(p);
    g.noise(p.x, p.z, 45, p);
    const heardBelow = Math.hypot(z.wx - z.x, z.wz - z.z) > 0.5 || z.timer === 10, heardTop = top.timer === 10;
    // a street shot right over it
    z.wx = z.x; z.wz = z.z; z.timer = 99;
    g.noise(z.x, z.z, 60, null);
    const leaked = z.timer === 10;
    g.removeChar(top); g.removeChar(z);
    await home();
    return heardBelow && !heardTop && !leaked ? true : JSON.stringify({ heardBelow, heardTop, leaked });
  });

  await check('underground: the draw calls stay under 150 below (the cave, the holdout, the facility\'s lab level)', async () => {
    const out = {};
    for (const [id, k] of [['redrock_cave', 1], ['outpost9_deep', 1], ['the_lull', 3]]) { await stage(id, k); g.render(0); out[`${id}:${k}`] = (await C('perf')).drawCalls; }
    await home();
    return Object.values(out).every((n) => n < 150) ? true : JSON.stringify(out);
  });
  await home();
}
