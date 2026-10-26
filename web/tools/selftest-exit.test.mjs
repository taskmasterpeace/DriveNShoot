import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { spawn } from 'node:child_process';
import { ROOT, startHarness } from './shard-kit.mjs';

let harness;
before(async () => { harness = await startHarness(Number(process.env.DL_SELFTEST_TEST_PORT ?? 3181)); });
after(() => harness?.stop());

function runCheck() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['tools/dl.mjs', 'selftest', 'only=state readable', '--raw'], {
      cwd: ROOT, env: { ...process.env, DL_URL: harness.base }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '', errors = '';
    child.stdout.on('data', (part) => { output += part; });
    child.stderr.on('data', (part) => { errors += part; });
    child.on('error', reject);
    child.on('exit', (code) => {
      try { resolve({ code, result: JSON.parse(output) }); }
      catch { reject(new Error(errors || output || `test command exited ${code}`)); }
    });
  });
}

test('a passing selftest exits with zero', async () => {
  const { code, result } = await runCheck();
  assert.equal(result.total, 1);
  assert.equal(result.passed, 1);
  assert.equal(result.ok, true);
  assert.equal(code, 0);
});

test('a failed selftest exits with one and reports the failed count', async () => {
  // Fault injection in this private browser: fail one real check without harming a live game or a save.
  const setup = await harness.call('exec', { code: `
    const read = DL.COMMANDS.state.run;
    DL.COMMANDS.state.run = async (args) => {
      const state = await read(args);
      return { ...state, player: { ...state.player, alive: false } };
    };
    true;
  ` });
  assert.equal(setup.ok, true);
  const { code, result } = await runCheck();
  assert.equal(result.total, 1);
  assert.equal(result.passed, 0);
  assert.equal(result.results[0].pass, false);
  assert.equal(result.ok, false);
  assert.equal(code, 1);
});
