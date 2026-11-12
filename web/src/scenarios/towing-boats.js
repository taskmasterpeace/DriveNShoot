// TOWING AND BOATS (docs/design/WEB_MOVE_TOW.md): you are at the wheel of a wrecker on the lake's west shore. Ahead of you
// a dead sedan sits across the track (G at the wheel hitches it to the boom), a pickup is bogged to its axles in a mud pit
// (hold G to winch it free), and a pickup with a boat trailer and a skiff on the bunks waits beside the water (F to get
// in, back the trailer into the lake, G launches the boat). Everything is the real system: no god mode, no free repair.
// Run: node tools/dl.mjs scenario name=towing-boats
import { LAKE } from '../world/water.js';

export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 14 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9;
  const sx = LAKE.x - LAKE.r - 14, sz = LAKE.z; // the west shore, 14 m back from the water line
  await DL.teleport({ x: sx - 22, z: sz - 6 });
  await DL.step({ seconds: 1 });
  // Clear the site by AREA (last run's props, and anything parked on the shore): the job is staged on bare ground.
  for (const v of [...g.vehicles]) if (g.player.inVehicle?.id !== v.id && Math.hypot(v.x - sx, v.z - sz) < 90) g.vehiclesSys.remove(v);
  // Spawn everything, let the world settle (a far teleport can rebuild the vehicle objects), then work on the live ones.
  const wrecker = g.vehiclesSys.spawn('towtruck', sx - 24, sz - 6, Math.PI / 2, '#8a6a1c'); // the wrecker you are in, nose to the east
  const dead0 = g.vehiclesSys.spawn('sedan', sx - 8, sz - 6, Math.PI / 2, '#5a4a3a');      // a dead car across the track, 16 m ahead
  const pitX = sx - 26, pitZ = sz - 22; // 16 m north of the wrecker, inside the winch cable's 30 m
  await DL.tow({ action: 'mud', x: pitX, z: pitZ, r: 6 });
  const bogged0 = g.vehiclesSys.spawn('pickup', pitX, pitZ, Math.PI, '#4f6a5a');           // sunk in the mud pit to the north
  // The boat rig, truck facing away from the water so the trailer's tail points at it.
  const rig = await DL.tow({ action: 'spawn', what: 'rig', x: sx + 2, z: sz + 22, h: -Math.PI / 2 });
  await DL.step({ seconds: 1 });
  const live = (id) => g.vehicles.find((c) => c.id === id);
  for (const id of [wrecker.id, dead0.id, bogged0.id, rig.truck, rig.trailer, rig.boat]) { const v = live(id); if (v) v.tlab = true; }
  const dead = live(dead0.id), bogged = live(bogged0.id);
  if (dead.dmg) dead.dmg.engine = 0; // engine gone,
  dead.fuel = 0;                      // and nothing in the tank
  bogged.bog = 0.9;
  await DL.enterVehicle({ id: wrecker.id, force: true });
  if (g.player.inVehicle?.id !== wrecker.id) { await DL.teleport({ x: wrecker.x + 3, z: wrecker.z }); await DL.enterVehicle({ id: wrecker.id, force: true }); }
  g.hud.toast('TOWING · hook the dead sedan, winch the bogged pickup, launch the skiff', 'info');
  g.hud.subtitle('GOAL: tow the dead sedan clear (G behind it), winch the bogged pickup out (hold G, nose to it), then back the boat trailer into the lake and press G.', 14);
  return { wrecker: wrecker.id, dead: dead.id, bogged: bogged.id, rig, shore: { x: sx, z: sz }, look: 'you start in the wrecker; the rig is 28 m south-east by the water' };
}
