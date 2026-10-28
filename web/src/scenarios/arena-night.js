// ARENA NIGHT (docs/design/WEB_WORKSHOP.md §8): the loaner night in a dust bowl. The promoter's junker (sheet steel, a hood
// MG) with a roof rocket pod and an oil sprayer bolted on, against three Dustwolf cars built at the same counter: a twin-MG
// sedan, a rocket-pod interceptor on spikes, and a ram-plated pickup with a roof flamer. Crate stacks for the barrels.
// The scene fights itself for a while (you drive straight, the turret and the hood take what their arcs hold, the tail
// drops oil on whoever sits behind), then hands back what happened.
// Run: node tools/dl.mjs scenario name=arena-night   (then screenshot, or drive it yourself)
// Open sand in the southern Glass Flats: the first 110 x 70 m with nothing solid in it, dry, off the stunt strip.
function arenaSpot(g) {
  for (let x = -380; x <= 380; x += 20) for (let z = 300; z <= 400; z += 20) {
    if (x > 300) continue;
    let clear = true;
    for (const b of g.statics.boxes) if (b.maxX > x - 55 && b.minX < x + 55 && b.maxZ > z - 35 && b.minZ < z + 35) { clear = false; break; }
    if (clear && g.water.depthAt(x, z) <= 0 && g.water.depthAt(x + 40, z) <= 0 && g.water.depthAt(x - 40, z) <= 0) return { x, z };
  }
  return { x: 220, z: 330 };
}

export default async function (DL, game) {
  const g = game, AT = arenaSpot(g);
  await DL.start();
  if (g.player.inVehicle) await DL.exitVehicle();
  await DL.setTime({ hour: 22 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  await DL.teleport({ x: AT.x - 30, z: AT.z });
  for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - AT.x, c.z - AT.z) < 120) g.removeChar(c);
  const W = g.workshop, fit = (v, part, face, n) => W.install(v, { part, face, n, pay: false, time: false });

  // The loaner (data/workshop.js LOANER), with the promoter's extras for tonight.
  const lo = await DL.arena({ loaner: true });
  const me = g.vehicles.find((v) => v.id === lo.vehicle);
  me.x = AT.x - 36; me.z = AT.z; me.h = Math.PI / 2;
  fit(me, 'rockets', 'top'); fit(me, 'oil', 'rear'); fit(me, 'sheet', 'left', 6); fit(me, 'sheet', 'right', 6);
  await DL.enterVehicle({ id: me.id, force: true });

  // The field.
  const field = [];
  const raider = async (type, x, z, h, build) => {
    const r = await DL.spawnVehicle({ type, x, z, heading: h, paint: '#3a2a1c', ai: 'raider' });
    const v = g.vehicles.find((q) => q.id === r.id);
    for (const [part, face, n] of build) fit(v, part, face, n);
    field.push(v);
    return v;
  };
  await raider('sedan', AT.x + 30, AT.z - 18, -Math.PI / 2, [['mg', 'front'], ['plate', 'front', 10], ['plate', 'left', 6], ['plate', 'right', 6]]);
  await raider('interceptor', AT.x + 34, AT.z + 16, -Math.PI / 2, [['rockets', 'front'], ['spikes', 'left', 6], ['spikes', 'right', 6], ['sheet', 'front', 8]]);
  await raider('pickup', AT.x + 48, AT.z, -Math.PI / 2, [['flamer', 'top'], ['ram', 'front', 14], ['caltrops', 'rear']]);

  // Crate stacks for the barrels (systems/materials.js pieces: wood, they break under fire and rams).
  for (const [sx, sz] of [[AT.x - 8, AT.z - 14], [AT.x - 8, AT.z + 14], [AT.x + 14, AT.z]]) for (let i = 0; i < 3; i++) await DL.build({ kind: 'crate', x: sx + (i % 2) * 1.1, z: sz + Math.floor(i / 2) * 1.1 }).catch(() => null);

  // Fight: drive at them; the turret takes whoever is nearest, the hood fires when its arc holds one, the tail oils the road.
  const seq0 = g.eventSeq, t0 = g.time;
  g.driveOverride = { throttle: 0.75, steer: 0 };
  for (let i = 0; i < 48; i++) {
    const live = field.filter((v) => !v.dead);
    if (!live.length || me.dead) break;
    let near = live[0];
    for (const v of live) if (Math.hypot(v.x - me.x, v.z - me.z) < Math.hypot(near.x - me.x, near.z - me.z)) near = v;
    await DL.mount({ group: 3, id: near.id });
    await DL.mount({ group: 1, id: near.id, hold: 0.1 });
    if (i % 12 === 6) await DL.mount({ group: 2 });
    g.driveOverride = { throttle: 0.75, steer: Math.sin(i * 0.4) * 0.5 };
    await DL.step({ seconds: 0.25 });
  }
  g.driveOverride = null;
  const ev = g.events.filter((e) => e.seq > seq0);
  const count = (t) => ev.filter((e) => e.type === t).length;
  const perf = await DL.perf().catch(() => ({}));
  return {
    at: AT, seconds: Math.round((g.time - t0) * 10) / 10,
    you: { id: me.id, hp: Math.round(me.hp), dead: !!me.dead, faces: W.report(me).faces },
    field: field.map((v) => ({ id: v.id, name: v.name, hp: Math.round(v.hp), dead: !!v.dead, plates: v.plates ? Object.fromEntries(Object.entries(v.plates).map(([k, x]) => [k, Math.round(x)])) : null })),
    events: { mountFire: count('mountFire'), rocket: count('rocket'), rocketHit: count('rocketHit'), breach: count('breach'), breachHit: count('breachHit'), slipped: count('slipped'), dropped: count('dropped'), kill: count('kill') },
    workshop: { ...W.stats },
    drawCalls: perf.drawCalls ?? perf.render?.calls ?? null,
    next: 'screenshot zoom=40, or drive: mount group=1|2|3, workshop action=stats',
  };
}
