// The camera tour (docs/design/WEB_CAMERA.md): every view on foot and at the wheel over Rust Haven, one row per stop
// with the boom (D, theta, yaw), the camera height, viewR and the draw calls - the breakage check after a camera or
// world change. Leaves the camera as it found it (TOPDOWN, the start zoom).
//   node tools/dl.mjs scenario name=camera-tour
export default async function (DL, game) {
  await DL.start();
  const R = game.cam, rows = [];
  const shot = async (mode, view) => {
    await DL.camera({ view, settle: true });
    await DL.step({ seconds: 0.5 });
    game.render(0);
    const perf = await DL.perf(), s = R.status();
    rows.push({ mode, view: s.eff, d: s.d, theta: s.theta, yaw: s.yaw, height: s.height, viewR: s.viewR, drawCalls: perf.drawCalls });
  };
  await DL.teleport({ x: 0, z: -40 });
  for (const view of ['TOPDOWN', 'ANGLED', 'ISO']) await shot('foot', view);
  const v = await DL.spawnVehicle({ type: 'sedan', x: game.player.x + 4, z: game.player.z, heading: Math.PI });
  await DL.enterVehicle({ id: v.id, force: true });
  for (const view of ['TOPDOWN', 'ANGLED', 'ISO', 'CHASE']) await shot('drive', view);
  await DL.exitVehicle({});
  await DL.camera({ view: 'TOPDOWN', settle: true });
  const worst = Math.max(...rows.map((r) => r.drawCalls));
  return { rows, worstDrawCalls: worst, underBudget: worst < 150 };
}
