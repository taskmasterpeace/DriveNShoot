// What the session recorder costs a frame (docs/design/WEB_OBSERVER.md §8): one page, the recorder toggled on and off
// in ABBA blocks over the same busy scene, frames run the way the real-time loop runs them (streamer.runFrames: sim +
// render, GPU-synced), plus the sim alone and the tick by itself. Run: node tools/dl.mjs scenario name=recorder-cost

export default async (DL, g) => {
  await DL.call('start');
  await DL.call('teleport', { x: 0, z: -30 });
  await DL.call('setTime', { hour: 13 }); await DL.call('setWeather', { key: 'CLEAR', instant: true });
  await DL.call('step', { seconds: 1 });
  const R = g.recorder, was = R.on;
  const order = [true, false, false, true]; // ABBA
  const blocks = 16, secs = 3;
  const on = [], off = [], simOn = [], simOff = [];
  for (let b = 0; b < blocks; b++) {
    const rec = order[b % 4];
    R.on = rec; if (rec) R.nextT = g.time;
    const f = await g.streamer.runFrames(secs, null, { renderEvery: 1 });
    (rec ? on : off).push(f.frameMs.avg);
    // The sim alone (no render), 120 frames, same toggle.
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) g.frame(1 / 60);
    (rec ? simOn : simOff).push((performance.now() - t0) / 120);
  }
  // The tick alone: a non-sample frame and a sample frame.
  R.on = true;
  const keepNext = R.nextT; R.nextT = g.time + 1e9;
  let t = performance.now();
  for (let i = 0; i < 1e6; i++) R.tick();
  const idleNs = ((performance.now() - t) / 1e6) * 1e6;
  t = performance.now();
  for (let i = 0; i < 5000; i++) { R.nextT = g.time; R.tick(); }
  const sampleUs = ((performance.now() - t) / 5000) * 1e3;
  R.nextT = keepNext; R.on = was;
  R.reset(false);
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1)); };
  const diff = (a, b) => { const d = mean(a) - mean(b), se = Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length); return { onMinusOffMs: +d.toFixed(4), ci95: [+(d - 1.96 * se).toFixed(4), +(d + 1.96 * se).toFixed(4)] }; };
  const r3 = (v) => +v.toFixed(3);
  // A sample costs sampleUs once every (60 / rate) frames; per frame that is:
  const perFrameUs = idleNs / 1000 + sampleUs * (R.rate / 60);
  return {
    blocks, secondsPerBlock: secs, pattern: 'ABBA (on, off, off, on) x4',
    frame: { onMs: r3(mean(on)), offMs: r3(mean(off)), ...diff(on, off), each: { on: on.map(r3), off: off.map(r3) } },
    sim: { onMs: r3(mean(simOn)), offMs: r3(mean(simOff)), ...diff(simOn, simOff) },
    tick: { idleNs: +idleNs.toFixed(1), sampleUs: +sampleUs.toFixed(2), perFrameAverageUs: +perFrameUs.toFixed(3), shareOf16msFrame: `${((perFrameUs / 16667) * 100).toFixed(4)}%` },
    verdict: perFrameUs < 5 ? 'no measurable frame cost: the tick is below the noise of the frame A/B by orders of magnitude' : 'measurable: look at the tick',
  };
};
