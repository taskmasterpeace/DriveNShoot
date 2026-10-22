// Performance stress: fill the character budget, start a storm, run 10s of
// sim and report frame cost + draw calls. Use after any engine change.
export default async function (DL, game) {
  await DL.start();
  await DL.god({ on: true });
  await DL.setWeather({ key: 'STORM', instant: true });
  await DL.teleport({ x: -200, z: -200 });
  await DL.spawn({ kind: 'raider', count: 20, x: -180, z: -200 });
  await DL.spawn({ kind: 'warden', count: 20, x: -220, z: -200 });
  const t0 = performance.now();
  await DL.step({ seconds: 10 });
  const simMs = performance.now() - t0;
  const perf = await DL.perf();
  await DL.god({ on: false });
  return { simMsPer60Frames: +(simMs / 10).toFixed(1), msPerFrame: +(simMs / 600).toFixed(2), drawCalls: perf.drawCalls, chars: perf.chars, alive: perf.alive };
}
