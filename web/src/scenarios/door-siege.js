// A SPRINTER AT YOUR DOOR (docs/design/WEB_DOOR_POUND.md): you are in the doorway of a house in the ruins with the door
// open. One of them out in the street breaks, screams and comes; two shamblers follow the noise. Step back, press E to
// shut the door, hold E to lean on it, and find out how long a wooden door lasts. No god mode: you have a pistol.
//   node tools/dl.mjs scenario name=door-siege            (then play it: the page is yours)
//   node tools/dl.mjs scenario name=door-siege            (an agent: the summary says what was staged; `pound` reads the door)
// Re-running re-stages it (the door back on its hinges, the old herd gone).
export default async function (DL, game) {
  const g = game, I = g.interiors, Z = g.zombies, M = g.materials;
  await DL.start();
  await DL.setTime({ hour: 17.5 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  g.zombies.enabled = false; // only this door's company: no night herd walking in on the lesson
  g.godMode = false; if (g.qol.photo) g.qol.togglePhoto(false); // played for real (a lineup run before this leaves both on)
  if (g.player.inVehicle) await DL.exitVehicle();
  const free = (x, z) => g.nav.foot.free(x, z);
  const d = I.doors.find((q) => (q.kind === 'front' || q.kind === 'back') && q.leaves.length === 1 && !q.ug && !q.ring && (q.y ?? 0) < 0.5 && q.material === 'wood' && Math.max(Math.abs(q.x), Math.abs(q.z)) < 440
    && [1.5, 4, 8, 12, 16].every((k) => free(q.x + q.nx * k, q.z + q.nz * k)) && [1.2, 2.2, 3.2].every((k) => free(q.x - q.nx * k, q.z - q.nz * k)));
  if (!d) return { ok: false, why: 'no wooden door with a clear street in front of it' };
  for (const c of [...g.chars]) if (c !== g.player && !c.npc && Math.hypot(c.x - d.x, c.z - d.z) < 60) g.removeChar(c);
  // the door as built, standing open
  const rec = M.recs.get(`door:${d.id}`);
  if (rec) { M.dropRec?.(rec); M.recs.delete(rec.key); }
  M.brokenDoors.delete(d.id);
  if (g.gadgets.barred.some((b) => b.door === d)) g.gadgets.unbarricade(d);
  I.setLocked(d, false);
  d.broken = false; d.cracked = false; d.shutBy = null;
  for (const L of d.leaves) { L.th = 1.3; L.w = 0; I.orient(L); }
  I.tint(d); I.flush();
  // you, just inside the doorway, looking out
  await DL.teleport({ x: d.x - d.nx * 1.4, z: d.z - d.nz * 1.4 });
  g.player.face = Math.atan2(d.nx, d.nz);
  await DL.give({ weapon: 'pistol', pistol: 36 });
  await DL.equip({ weapon: 'pistol' });
  g.inventory.add(g.inventory.carried, 'planks', 1); // one set of planks in the pack: bar the door from the PACK screen if you think of it
  // the street: a sprinter 16 m out that has seen you, two shamblers further off that will hear it
  const at = (k, side) => ({ x: d.x + d.nx * k + d.ux * side, z: d.z + d.nz * k + d.uz * side });
  const s = Z.spawn(at(16, 0).x, at(16, 0).z, true);
  const herd = [at(22, 3), at(24, -4)].map((q) => Z.spawn(q.x, q.z, false)).filter(Boolean);
  if (s) { s.face = Math.atan2(g.player.x - s.x, g.player.z - s.z); Z.remember(s, g.player.x, g.player.z, 'told', g.player); s.ztarget = g.player; Z.burst(s, 'staged'); } // staged as one that has just seen you in the doorway (a told memory: the scenario says so; its senses take over from here)
  g.hud.toast('ONE OF THEM HAS SEEN YOU · E SHUTS THE DOOR · HOLD E TO LEAN ON IT', 'hot');
  return {
    ok: true, door: d.id, material: d.material, hp: I.doorHp(d), you: { x: +g.player.x.toFixed(1), z: +g.player.z.toFixed(1) },
    sprinter: s?.id ?? null, shamblers: herd.map((c) => c.id),
    keys: 'E at the open door shuts it; hold E at the shut door leans on it; the PACK screen (I) bars it with the planks you carry; tap E kicks it open',
    read: 'node tools/dl.mjs pound   (the door: hp left, who is beating it)',
  };
}
