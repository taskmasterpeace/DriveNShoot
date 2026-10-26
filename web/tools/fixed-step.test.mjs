import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startHarness } from './shard-kit.mjs';

let harness;
before(async () => {
  harness = await startHarness(Number(process.env.DL_STEP_TEST_PORT ?? 3182));
  const setup = await harness.call('exec', { code: `
    const step = DL._step;
    DL._step = async function (n, dt) {
      const frame = game.frame;
      let frames = 0;
      game.frame = function (...args) { frames++; return frame.apply(this, args); };
      try {
        await step.call(this, n, dt);
        game.stepProbe = { requested: n, actual: frames, held: game.holdLoop, paused: game.paused };
      } finally { game.frame = frame; }
    };
    true;
  ` });
  assert.equal(setup.ok, true);
});
after(() => harness?.stop());

test('a ten-second step runs exactly 600 frames and restores pause and clock state', async () => {
  await harness.call('exec', { code: 'game.holdLoop = false; game.paused = true; true' });
  const step = await harness.call('step', { seconds: 10 });
  assert.equal(step.ok, true);
  const probe = (await harness.call('exec', { code: 'game.stepProbe' })).value;
  assert.deepEqual(probe, { requested: 600, actual: 600, held: false, paused: true });
});

test('a nested step keeps an already held animation loop held', async () => {
  await harness.call('exec', { code: 'game.holdLoop = true; game.paused = false; true' });
  assert.equal((await harness.call('step', { seconds: 0.1 })).ok, true);
  const probe = (await harness.call('exec', { code: 'game.stepProbe' })).value;
  assert.deepEqual(probe, { requested: 6, actual: 6, held: true, paused: false });
});

test('selftest holds its clock between steps and restores the previous clock state', async () => {
  await harness.call('exec', { code: `
    game.holdLoop = false;
    const read = DL.COMMANDS.state.run;
    DL.COMMANDS.state.run = async (args) => { game.commandClockHeld = game.holdLoop; return read(args); };
    true;
  ` });
  const result = await harness.call('selftest', { only: 'state readable' });
  assert.equal(result.passed, 1);
  const state = (await harness.call('exec', { code: '({ during: game.commandClockHeld, after: game.holdLoop })' })).value;
  assert.deepEqual(state, { during: true, after: false });
});

test('staging a later input check feeds and wakes an exhausted survivor before the real Y exit press', async () => {
  await harness.call('needs', { rest: 0, food: 0, water: 0 });
  await harness.call('exec', { code: `
    game.holdLoop = true; game.needs.blackout = 0; game.survival.microT = 6.3;
    game.stageUpdate = game.updatePlayer;
    game.updatePlayer = function (...args) {
      if (game.controls.virtual?.buttons?.y) game.stageExitProbe = {
        rest: game.needs.rest, food: game.needs.food, water: game.needs.water, blackout: game.needs.blackout,
      };
      return game.stageUpdate.apply(this, args);
    };
    true;
  ` });
  try {
    const result = await harness.call('selftest', { only: 'controller: the pad moves' });
    assert.equal(result.passed, 1, JSON.stringify(result.results));
    const probe = (await harness.call('exec', { code: 'game.stageExitProbe' })).value;
    assert.ok(probe.rest > 0.9 && probe.food > 0.9 && probe.water > 0.9, JSON.stringify(probe));
    assert.equal(probe.blackout, 0);
  } finally {
    await harness.call('exec', { code: 'game.updatePlayer = game.stageUpdate; delete game.stageUpdate; game.holdLoop = false; true' });
  }
});
