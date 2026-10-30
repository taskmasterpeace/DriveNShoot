import * as THREE from 'three';

// DIVES AND MOVES (docs/design/WEB_MOVE_TOW.md): a short obstacle course on the open desert block north of Route 66, in a line going
// north (up the screen). SPACE reads the ground ahead and does the right thing: a waist-high wall or a car hood is a VAULT,
// a chest-high wall a CLIMB, crouched it is a roll, at a sprint with nothing ahead it is a dive onto your belly. CTRL at a
// sprint slides. At the end a parked RV: E at its rear ladder climbs the roof, and SPACE at the roof's edge drops you
// hanging, then to the ground. The walls are real collision boxes with plank-and-post meshes on them; the car is a real
// sedan. Stamina is real: every move costs some.
// Run: node tools/dl.mjs scenario name=moves-course
const X = 282, Z0 = -6; // the open desert block north of Route 66, between the two cross streets; the course runs north (up the screen)

export default async function (DL, game) {
  const g = game;
  await DL.start();
  await DL.setTime({ hour: 11 });
  await DL.setWeather({ key: 'CLEAR', instant: true });
  if (g.player.inVehicle) await DL.exitVehicle();
  g.zombies.enabled = false; g.raiderTimer = 1e9; g.wanted = 0;
  // Last run's course goes first.
  for (const m of g.tlabCourse ?? []) { g.scene.remove(m); m.geometry?.dispose(); }
  g.statics.extra = g.statics.extra.filter((b) => b.tag !== 'tlab-course');
  g.tlabCourse = [];
  for (const v of [...g.vehicles]) if (g.player.inVehicle?.id !== v.id && Math.hypot(v.x - X, v.z - (Z0 - 30)) < 45 && !v.pol) g.vehiclesSys.remove(v); // the course ground is cleared by area
  await DL.teleport({ x: X, z: Z0 });
  await DL.step({ seconds: 0.5 });

  const mats = { wood: new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9 }), post: new THREE.MeshStandardMaterial({ color: 0x5a4328, roughness: 0.9 }), stone: new THREE.MeshStandardMaterial({ color: 0x9a9388, roughness: 0.95 }) };
  const wall = (z, h, mat, name, half = 5) => {
    const thick = h > 1.2 ? 0.3 : 0.12;
    g.statics.extra.push({ minX: X - half, maxX: X + half, minZ: z - thick / 2, maxZ: z + thick / 2, tag: 'tlab-course', height: h, mark: 0, op: null, holes: null, holeX: false, sill: 0, base: 0, owner: null });
    const m = new THREE.Mesh(new THREE.BoxGeometry(half * 2, h, thick), mats[mat]); m.position.set(X, h / 2, z); m.castShadow = true; m.receiveShadow = true; g.scene.add(m); g.tlabCourse.push(m);
    if (mat === 'wood') for (let k = -half; k <= half; k += 2.5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.2, h + 0.15, 0.2), mats.post); p.position.set(X + k, (h + 0.15) / 2, z); g.scene.add(p); g.tlabCourse.push(p); }
    return name;
  };
  const stages = [];
  stages.push(wall(Z0 - 8, 0.9, 'stone', 'low wall 0.9 m: vault'));
  stages.push(wall(Z0 - 18, 1.05, 'wood', 'plank fence 1.05 m: vault'));
  stages.push(wall(Z0 - 28, 1.5, 'stone', 'chest-high wall 1.5 m: climb'));
  // A sedan parked side-on: its hood is the vault.
  const car = g.vehiclesSys.spawn('sedan', X + 3.2, Z0 - 38, 0, '#5a4a3a'); car.tlab = true; car.ai = null;
  stages.push('parked sedan beside the lane: run at its hood from the west (D) and vault it');
  // The RV with a roof deck.
  const rv = g.vehiclesSys.spawn('rv', X, Z0 - 52, 0, '#7a6a52'); rv.tlab = true; rv.ai = null;
  stages.push('RV: ladder at the rear (E), roof edge (SPACE: drop-hang)');
  await DL.step({ seconds: 1 });
  g.hud.toast('MOVES · low wall, fence, chest-high wall, a car hood, an RV roof', 'info');
  g.hud.subtitle('GOAL: run north (W) and clear each obstacle with SPACE at a sprint (Shift). Wall: vault. High wall: climb. Roll crouched. CTRL slides. End: climb the RV (E at the ladder) and drop off its edge.', 14);
  return { stages, rv: rv.id, car: car.id, start: { x: X, z: Z0 }, move: await DL.move({}).then((m) => ({ stance: m.stance, stamina: m.stamina })) };
}
