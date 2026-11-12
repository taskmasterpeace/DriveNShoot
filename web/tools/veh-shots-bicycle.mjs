#!/usr/bin/env node
// VEHICLES V2 slice 10 proof shots, THE BICYCLE: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-bicycle.mjs <outdir> [before|after]
// Before: only a motorcycle to ride. After: a bicycle beside it, then riding it standing on the pedals (the stamina bar drops).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const [outArg = 'shots', tag = 'after'] = process.argv.slice(2);
const OUT = resolve(outArg); mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?agent=0', width: 1280, height: 720, log: () => {} });
const D = await cdp(h);
const until = async (expr, ms = 120000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } return false; };
const call = async (cmd, args = {}) => JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`));
const ev = async (code) => JSON.parse(await D.eval(`(() => JSON.stringify(${code}))()`));
const shot = async (name, wait = 400) => { await sleep(wait); const f = join(OUT, `bicycle-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const YARD = { x: 250, z: 430 };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 11 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: YARD.x, z: YARD.z - 4 }); await call('zoom', { level: 'CLOSE' });
  await call('camera', { view: 'ANGLED', cut: true }).catch(() => null);
  const has = await ev(`(() => { game.vehiclesSys.spawn('bike', ${YARD.x - 2.5}, ${YARD.z}, 0, '#3a3632'); window._b = game.bicycles ? game.vehiclesSys.spawn('bicycle', ${YARD.x + 2.5}, ${YARD.z}, 0, '#2f6f8a') : null; return !!window._b; })()`);
  console.log('has bicycle', has);
  await call('step', { seconds: 1.5 });
  await shot('1-beside-the-motorcycle');
  if (has) {
    await call('enterVehicle', { id: await ev('window._b.id'), force: true }); await call('zoom', { level: 'CLOSE' });
    await call('camera', { view: 'ANGLED', mode: 'drive', cut: true }).catch(() => null);
    await ev(`(() => { game.input.down.add('KeyW'); game.input.down.add('ShiftLeft'); return true; })()`);
    await call('step', { seconds: 4 });
    await shot('2-standing-on-the-pedals', 0);
    await ev(`(() => { game.input.down.delete('KeyW'); game.input.down.delete('ShiftLeft'); return true; })()`);
    console.log('stamina', await ev('Math.round(game.player.stamina * 100) / 100'));
  }
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
