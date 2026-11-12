// TEST LAB checks (web/testlab.html, src/scenarios/*): one named check per scenario - it loads, its pieces exist, and the
// player can act in it. The "can act" half goes through the same commands and systems the player's keys reach (a hitch, a
// pick-up from the ground, a vault, a sit at a table), never a flag. Names start "testlab:" (only=testlab runs just these).
// Staged: the scenario itself (that is its job); everything it leaves is cleared before the next check.
import { LAKE } from '../world/water.js';

const SCENARIOS = ['towing-boats', 'semi-run', 'melee-yard', 'casino-night', 'long-road', 'police-response', 'moves-course', 'doll-pack'];
const LOOKS = ['garage-lineup', 'people-lineup', 'interior-lineup', 'lsw-bodies', 'gait-strip'];
export const TESTLAB_IDS = [...SCENARIOS, ...LOOKS];

export async function testLabChecks(api, check, C) {
  const g = api.g, P = () => g.player;
  const was = { god: g.godMode, z: g.zombies.enabled, r: g.raiderTimer, hour: g.sky.time, cg: g.citygen.enabled, pol: g.police?.enabled, wanted: g.wanted };
  const clear = async () => {
    if (g.qol.photo) g.qol.togglePhoto(false);
    if (g.invUI?.open) g.invUI.toggle(false);
    if (P().inVehicle) await C('exitVehicle').catch(() => null);
    for (const v of [...g.vehicles]) if (v.tlab || v.lineup) { for (const o of (v.occ ?? [])) if (o && o !== P()) g.removeChar(o); g.vehiclesSys.remove(v); }
    for (const c of [...g.chars]) if (c !== P() && (c.yard || c.booth || c.gait || c.lswShot)) g.removeChar(c);
    for (const m of g.tlabCourse ?? []) { g.scene.remove(m); m.geometry?.dispose(); }
    g.tlabCourse = [];
    g.statics.extra = g.statics.extra.filter((b) => b.tag !== 'tlab-course');
    for (const id of ['tlab-casino-town', 'tlab-police-town']) if (g.citygen.byId?.has(id)) g.citygen.remove(id);
    await C('fight', { action: 'clear' }).catch(() => null);
    await C('semi', { action: 'clear' }).catch(() => null);
    await C('police', { action: 'clear' }).catch(() => null);
    for (const p of [...(g.towing?.pits ?? [])]) if (/^pit/.test(p.id)) g.towing.removePit(p.id);
    for (const l of [...(g.towing?.links ?? [])]) g.towing.release(l);
    g.needs.wounds.length = 0; P().bleed = 0; P().hp = P().maxHp; P().prone = false; P().mv = null;
    g.godMode = was.god; g.zombies.enabled = was.z; g.raiderTimer = was.r; g.wanted = was.wanted;
    g.hud.el?.subtitle?.classList.add('hidden');
  };
  const run = async (name) => { const r = await C('scenario', { name }); return r.ok ? r.summary ?? {} : { fail: r.error ?? 'scenario failed' }; };
  const sc = (name, fn) => check(`testlab: ${name} loads, its pieces exist and the player can act`, async () => {
    try { const s = await run(name); if (s.fail) return s.fail; if (s.ok === false) return s.error ?? 'scenario said not ok'; return await fn(s); }
    finally { await clear(); }
  });
  const near = (x, z, r) => (o) => Math.hypot(o.x - x, o.z - z) < r;

  // Vehicle ids are not unique across a long session (a town's police cars and a hot reload reuse numbers), so the pieces are
  // found the way a player finds them: the thing of that kind nearest you.
  const nearest = (fn, r = 120) => g.vehicles.filter((v) => fn(v) && Math.hypot(v.x - P().x, v.z - P().z) < r).sort((a, b) => Math.hypot(a.x - P().x, a.z - P().z) - Math.hypot(b.x - P().x, b.z - P().z))[0];

  await sc('towing-boats', async () => {
    const W = P().inVehicle;
    if (W?.type !== 'towtruck') return `not at the wrecker's wheel (in ${W?.type})`;
    const D = nearest((v) => v.type === 'sedan' && v.dmg?.engine <= 0, 40), B = nearest((v) => v.type === 'pickup' && (v.bog ?? 0) > 0.5, 40);
    const T = nearest((v) => v.boatTrailer, 90), boat = nearest((v) => v.boat && v.onTrailer, 90);
    if (!(D && B && T && boat)) return `missing a piece ${JSON.stringify({ dead: !!D, bogged: !!B, trailer: !!T, boat: !!boat })}`;
    const view = g.towing.view();
    if (!view.bogged.some((b) => b.id === B.id && b.stuck)) return `the pickup is not bogged: ${JSON.stringify(view.bogged)}`;
    if (!view.trailers.some((t) => t.id === T.id && t.boat)) return `the skiff is not on its trailer: ${JSON.stringify(view.trailers)}`;
    if (Math.hypot(T.x - LAKE.x, T.z - LAKE.z) > LAKE.r + 40) return 'the trailer is not by the lake';
    // The player acts: the wrecker's boom takes the dead car, and the winch (G held, nose to it) frees the bogged one.
    const h1 = await C('tow', { action: 'hitch', from: W.id, to: D.id, kind: 'boom' });
    const boom = h1.links?.find((l) => l.kind === 'boom' && l.to === D.id);
    if (!boom) return `no boom line: ${JSON.stringify(h1).slice(0, 160)}`;
    await C('tow', { action: 'release', id: boom.id });
    const bog0 = B.bog ?? 1;
    W.h = Math.atan2(B.x - W.x, B.z - W.z);
    g.input.down.add('KeyG');
    try { await api._step(840); } finally { g.input.down.delete('KeyG'); }
    const bog1 = B.bog ?? 1;
    return bog1 < bog0 - 0.1 ? true : `holding G did not winch the pickup out (bog ${bog0} -> ${bog1}, links ${JSON.stringify(g.towing.view().links.map((l) => [l.kind, l.to, l.len, l.winching, l.load]))})`;
  });

  await sc('semi-run', async (s) => {
    const car = P().inVehicle;
    if (car?.type !== 'interceptor') return `you are not in the car (in ${car?.type})`;
    const st0 = (await C('semi', { action: 'status' })).trailers;
    const box = st0.filter((t) => t.row === 'box' && t.towedBy && !t.cargo.length), wide = st0.filter((t) => t.row === 'wide' && t.cargo.length);
    if (!box.length) return `no empty car-hauler trailer under a tractor: ${JSON.stringify(st0.map((t) => [t.row, t.towedBy, t.cargo.length]))}`;
    if (!wide.length) return 'no lowboy with an RV on it';
    await C('step', { seconds: 3 });
    const T = (await C('semi', { action: 'status' })).trailers.find((t) => t.id === box[0].id && t.towedBy === box[0].towedBy);
    if (!T?.ramp || T.ramp.want !== 1) return `the ramp is not down: ${JSON.stringify(T?.ramp)}`;
    const x0 = car.x, z0 = car.z;
    await C('drive', { throttle: 1, seconds: 1.5 });
    return Math.hypot(car.x - x0, car.z - z0) > 5 ? true : 'the car did not move under your throttle';
  });

  await sc('melee-yard', async (s) => {
    const p = P(), inv = g.inventory;
    const piles = inv.boxes ? [...inv.boxes.values()].filter((b) => b.kind === 'ground' && Math.hypot(b.x - p.x, b.z - p.z) < 12) : [];
    const has = (id) => piles.find((b) => b.slots.some((q) => q.id === id));
    for (const id of s.weapons) if (!has(id)) return `no ${id} on the ground`;
    const raiders = s.raiders.map((id) => g.chars.find((c) => c.id === id));
    if (raiders.some((c) => !c?.alive || !c.meleeW)) return 'a raider is missing or unarmed';
    const hostage = g.chars.find((c) => c.id === s.hostage);
    if (!hostage?.alive || hostage.meleeW) return 'the hostage is missing or armed';
    // The player acts: walk to the bat, pick it up off the ground, raise it.
    const box = has('baseball_bat');
    // A full pack takes nothing more: put a few things down first, as a player would.
    for (let k = 0; k < 8; k++) { const it = (await C('item')).carried; if (it.cap - it.litres >= 3) break; const d = it.items.find((q) => !/^(ammo|baseball_bat|knife)/.test(q.id)); if (!d) break; await C('item', { drop: d.id, n: d.n }); }
    p.x = box.x; p.z = box.z + 0.4; await C('step', { seconds: 0.3 });
    const r0 = await C('item', { take: 'baseball_bat' });
    const r = await C('fight', { action: 'wield', weapon: 'bat' });
    const gone = !box.slots.some((q) => q.id === 'baseball_bat');
    return r.ok !== false && r.inHand === 'bat' && (gone || r0.ok !== false) ? true : `could not take and raise the bat: take ${JSON.stringify(r0).slice(0, 120)} wield ${r.ok} inHand ${r.inHand} gone ${gone}`;
  });

  await sc('casino-night', async (s) => {
    if (!s.venue) return 'no venue';
    if (!s.tables.includes('chess') || s.tables.filter((t) => t === 'blackjack').length < 1) return `tables ${s.tables}`;
    if (s.guards < 1 || s.drones < 1 || s.cameras < 1) return `guards ${s.guards} cameras ${s.cameras} drones ${s.drones}`;
    if (g.cash < 100) return 'no cash in your pocket';
    const sit = await C('casino', { action: 'sit', venue: s.venue, table: s.tables.indexOf('blackjack'), goto: true });
    if (sit.ok === false) return `could not sit: ${sit.error}`;
    const hand = await C('casino', { action: 'play', bet: 5 });
    await C('casino', { action: 'leave' });
    return hand.ok === false ? `could not deal: ${hand.error}` : true;
  });

  await sc('long-road', async (s) => {
    const car = g.vehicles.find((v) => v.id === s.car);
    if (!car || P().inVehicle?.id !== car.id) return 'you are not in the car';
    if (!(car.fuel >= car.fuelCap * 0.95)) return `tank ${car.fuel}/${car.fuelCap}`;
    if (!s.to || !(s.beats > 0)) return `destination ${s.to}, beats ${s.beats}`;
    await C('drive', { throttle: 1, seconds: 4 });
    await C('step', { seconds: 1 });
    const trip = (await C('longRoad', { action: 'trip' })).trip;
    return trip && trip.miles >= 0 ? true : `no trip started: ${JSON.stringify(trip)}`;
  });

  await sc('police-response', async (s) => {
    if (!s.town || !s.station) return `no desk: ${JSON.stringify(s).slice(0, 120)}`;
    const ammo = g.inventory.carried.count('ammo_pistol');
    if (P().inVehicle || !(ammo > 0)) return `not on foot with a loaded pistol (in ${P().inVehicle?.id}, ammo ${ammo}, weapon ${P().weapon})`;
    if (Math.hypot(P().x - s.station.x, P().z - s.station.z) > 120) return 'you are not near the station';
    const n0 = (await C('police', { action: 'dispatch' })).counts.reports;
    await C('fire', { x: P().x + 25, z: P().z, shots: 1 });
    await C('step', { seconds: 8 });
    const d = await C('police', { action: 'dispatch' });
    return d.counts.reports > n0 ? true : `a shot fired in town brought no report (${JSON.stringify(d.counts)})`;
  });

  await sc('moves-course', async (s) => {
    const p = P(), M = g.moves;
    const stand = async (x, z) => { await C('teleport', { x, z }); await C('step', { seconds: 0.2 }); };
    const X = s.start.x, Z = s.start.z;
    await stand(X - 0.2, Z - 6.8); const a = { ...M.probe(p, 0, -1) };
    await stand(X - 0.2, Z - 16.8); const b = { ...M.probe(p, 0, -1) };
    await stand(X - 0.2, Z - 26.8); const c = { ...M.probe(p, 0, -1) };
    const car = g.vehicles.find((v) => v.id === s.car), rv = g.vehicles.find((v) => v.id === s.rv);
    if (!car || !rv) return 'the sedan or the RV is missing';
    if (a.kind !== 'vault' || b.kind !== 'vault' || c.kind !== 'climb') return `probes ${JSON.stringify([a, b, c].map((q) => [q.kind, q.h, q.depth, q.what]))} at ${p.x},${p.z} gy ${p.gy}`;
    await stand(X - 0.2, Z - 6.8);
    const r = await C('move', { kind: 'vault', x: X - 0.2, z: Z - 20 });
    return r.ok !== false && p.z < Z - 8.1 ? true : `did not vault the low wall: ${JSON.stringify(r).slice(0, 200)} z=${p.z}`;
  });

  await sc('doll-pack', async () => {
    const N = g.needs, inv = g.inventory, p = P();
    if (!N.wounds.some((w) => w.kind === 'fracture') || !N.wounds.some((w) => w.kind === 'laceration')) return `wounds ${N.wounds.map((w) => w.kind)}`;
    if (!inv.carried.slots.some((q) => q.id === 'bandage') || !inv.carried.slots.some((q) => q.id === 'splint')) return 'no bandage and splint in the pack';
    const gr = [...inv.boxes.values()].find((b) => b.kind === 'ground' && b.slots.some((q) => q.id === 'ration') && Math.hypot(b.x - p.x, b.z - p.z) < 3);
    if (!gr) return 'nothing on the ground at your feet';
    const doll = g.hud.doll; g.hud.updateSlow();
    if (!doll.svg.querySelector('path[data-part="arm_l"]')?.getAttribute('class').includes('t-fractured')) return 'the doll does not show the broken left arm';
    const r = await C('wound', { treat: 'bandage' });
    return r.used || r.wounds ? (N.wounds.find((w) => w.kind === 'laceration')?.open === false ? true : 'the bandage did not close the cut') : `could not treat: ${JSON.stringify(r).slice(0, 160)}`;
  });

  for (const name of LOOKS) {
    await check(`testlab: ${name} loads, frames itself on its lineup, and . steps the camera along the row`, async () => {
      try {
        const s = await run(name); if (s.fail) return s.fail;
        const ph = g.qol.photo;
        if (!ph?.stops || ph.stops.length < 4) return `no camera stops (${ph?.stops?.length})`;
        if (!g.qol.photoCap?.textContent) return 'no caption on the lineup';
        const x0 = ph.x, z0 = ph.z;
        g.input.pressed.add('Period'); g.qol.updatePhoto(0, g.input); g.input.pressed.delete('Period');
        const moved = g.qol.photo.i === 1 && (g.qol.photo.x !== x0 || g.qol.photo.z !== z0);
        g.input.pressed.add('Comma'); g.qol.updatePhoto(0, g.input); g.input.pressed.delete('Comma');
        return moved && g.qol.photo.i === 0 ? true : `the stop key did not step: i=${g.qol.photo.i}`;
      } finally { await clear(); }
    });
  }
  g.sky.time = was.hour; g.citygen.enabled = was.cg;
}
