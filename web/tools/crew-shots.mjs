#!/usr/bin/env node
// THE CREW's breakage-check renders (docs/design/WEB_CREW.md): a real headless Chrome on the game at 1920x1080 with the
// HUD (the DOM panel and the radial are in these, unlike `screenshot`). Not art: proof the panel, the radial and a
// firefight draw without breaking. Writes docs/renders/web/crew/*.png.
//   DL_URL=http://localhost:3402 node tools/crew-shots.mjs [--size 1920x1080]
// Uses the dev server already up at DL_URL, its own throwaway Chrome profile, and stops exactly what it started (by PID).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1920x1080').split('x').map(Number);
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'crew');
mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?agent=0', width: W, height: H, log: console.log });
const D = await cdp(h);
await D.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const until = async (expr, ms = 60000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const shot = async (name) => { await sleep(700); const f = join(OUT, `${name}.png`); await D.shot(f); console.log('wrote', f); };
const call = (cmd, args = {}) => D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`);
try {
  await until('window.game && game.crew && game.crewUI');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: 240, z: -330 });
  for (const row of ['wheelboss', 'sleeper', 'quartermaster', 'sutler_guard']) await call('crewJoin', { spawn: row });
  await call('crewJob', { id: '2', job: 'tend', camp: true });
  await call('step', { seconds: 2 });
  // 1. The CREW panel: four cards, the flags behind them.
  await D.eval('(() => { game.crewUI.toggle(true); game.crewUI.render(); return true; })()');
  await shot('01-crew-panel');
  await D.eval('(() => { game.crewUI.toggle(false); return true; })()');
  // 2. The orders radial, a wedge picked.
  await D.eval(`(() => { const U = game.crewUI; U.openRadial(false); U.setPick(4); return true; })()`);
  await shot('02-orders-radial');
  await D.eval('(() => { game.crewUI.closeRadial(false); return true; })()');
  // 3. A firefight in the cover-rich block (the lab scenario), mid-fight, with the HUD.
  // (set up by hand, not with the scenario: its steps hold the loop, and this wants the live frame)
  for (const [kind, x, z, axis, len] of [['concrete_wall', 240, -327, 'x', 9], ['sandbags', 230, -344, 'x', 3], ['sandbags', 240, -346, 'x', 3], ['sandbags', 250, -344, 'x', 3], ['crate', 224, -352], ['crate', 256, -352], ['block_wall', 218, -338, 'z', 6], ['block_wall', 262, -338, 'z', 6]]) await call('build', { kind, x, z, axis, len });
  await call('crewOrder', { order: 'spread' });
  await D.eval(`(() => { game.aimOverride = { x: 240, z: -370 }; for (let i = 0; i < 6; i++) { const c = game.spawnRaider(228 + i * 5, -392 - (i % 2) * 4, Math.random, ['rifle', 'smg', 'shotgun'][i % 3]); c.grudge = game.player; c.target = game.player; c.state = 'fight'; } return true; })()`);
  await sleep(8000);
  await shot('03-firefight');

} finally {
  h.stop();
}
console.log('done');
