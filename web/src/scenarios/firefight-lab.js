// FIREFIGHT LAB (docs/design/WEB_CREW.md §6): two squads in a cover-rich block in the north-east glass flats - your crew
// of four (the Wheel Boss, the Sleeper, the Quartermaster, a sutler's guard) against six Dustwolves - with you holding
// fire behind a wall in god mode, watching. Stands walls, sandbags and crates first. Returns how each side fought: the
// roles taken, how many stood in cover, the flanks and the breaks, the suppression, the casualties, the plan cost.
// args: seconds (default 30), foes (default 6).
export default async function (DL, game, args = {}) {
  const g = game, K = g.crew, AT = { x: 240, z: -330 }, secs = Number(args.seconds ?? 30), foes = Number(args.foes ?? 6);
  await DL.start(); await DL.god({ on: true });
  await DL.setTime({ hour: 12 }); await DL.setWeather({ key: 'CLEAR', instant: true });
  g.zombies.enabled = false; g.raiderTimer = 1e9;
  await DL.teleport(AT);
  for (const c of [...g.chars]) if (c !== g.player && !c.npc && !c.crewRec && Math.hypot(c.x - AT.x, c.z - AT.z) < 140) g.removeChar(c);
  // The block: a wall for you, a line of sandbags and crates mid-field, two short walls on the flanks.
  const pieces = [];
  const build = async (kind, x, z, axis = 'x', len) => { const r = await DL.build({ kind, x, z, axis, len }); if (r.ok) pieces.push(r.id); };
  await build('concrete_wall', AT.x, AT.z + 3, 'x', 9);
  for (const [dx, dz] of [[-10, -14], [0, -16], [10, -14]]) await build('sandbags', AT.x + dx, AT.z + dz, 'x', 3);
  for (const [dx, dz] of [[-16, -22], [16, -22], [-5, -28], [5, -30]]) await build('crate', AT.x + dx, AT.z + dz);
  await build('block_wall', AT.x - 22, AT.z - 8, 'z', 6); await build('block_wall', AT.x + 22, AT.z - 8, 'z', 6);
  // Your crew.
  for (const m of [...K.members]) K.leave(m, 'dismissed', false);
  for (const row of ['wheelboss', 'sleeper', 'quartermaster', 'sutler_guard']) await DL.crewJoin({ spawn: row });
  await DL.step({ seconds: 1 });
  await DL.crewOrder({ order: 'spread' }); await DL.crewOrder({ order: 'freefire' });
  // You hold behind your wall and do not shoot: this is their fight.
  g.aimOverride = { x: AT.x, z: AT.z - 40 };
  // The Dustwolves, north.
  const wolves = [];
  for (let i = 0; i < foes; i++) {
    const c = g.spawnRaider(AT.x - 12 + i * 5, AT.z - 62 - (i % 2) * 4, Math.random, i % 3 === 0 ? 'rifle' : i % 3 === 1 ? 'smg' : 'shotgun');
    c.grudge = g.player; c.target = g.player; c.state = 'fight'; wolves.push(c);
  }
  const roles = { crew: {}, wolves: {} }, cover = { crew: 0, wolves: 0, n: 0 }, seq = g.eventSeq, T0 = { ...g.tactics.stats };
  for (let t = 0; t < secs; t += 0.5) {
    await DL.step({ seconds: 0.5 });
    cover.n++;
    for (const m of K.members) { const U = m.c?.tac; if (!U) continue; roles.crew[U.role] = (roles.crew[U.role] ?? 0) + 1; if (U.inCover) cover.crew++; }
    for (const c of wolves) { const U = c.tac; if (!U || !c.alive) continue; roles.wolves[U.role] = (roles.wolves[U.role] ?? 0) + 1; if (U.inCover) cover.wolves++; }
  }
  const ev = (type, pred = () => true) => g.events.filter((e) => e.seq > seq && e.type === type && pred(e)).length;
  const S = g.tactics.stats;
  const out = {
    seconds: secs, roles, inCoverSamples: { crew: cover.crew, wolves: cover.wolves, samples: cover.n },
    wolvesDown: wolves.filter((c) => !c.alive).length, wolves: wolves.length,
    crewDown: ev('crewDown'), crewDead: ev('crewDied'), breaks: { wolves: ev('tacBreak', (e) => e.faction === 'raider'), crew: ev('tacBreak', (e) => e.faction === 'ally') },
    tactics: { plans: S.plans - T0.plans, paths: S.paths - T0.paths, flanks: S.flanks - T0.flanks, suppressed: S.suppressed - T0.suppressed, boxCover: S.boxCover - T0.boxCover, avgPlanMs: +((S.planMs - T0.planMs) / Math.max(1, S.plans - T0.plans)).toFixed(3), maxPlanMs: +S.maxPlanMs.toFixed(3) },
    crew: K.members.map((m) => ({ name: m.name, card: m.row.name, hp: Math.round(m.c?.hp ?? 0), down: m.down, kills: m.kills, role: m.c?.tac?.role ?? null })),
  };
  if (!args.keep) { for (const id of pieces) try { g.materials.unbuild(id); } catch {} g.aimOverride = null; }
  return out;
}
