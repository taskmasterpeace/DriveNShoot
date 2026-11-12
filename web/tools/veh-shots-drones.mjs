#!/usr/bin/env node
// VEHICLES V2 slice 11 proof shots, SKY DRONES: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-drones.mjs <outdir> [before|after]
// 1: the Dustwolf roost's pad, its watcher up. 2: the watcher over you, the gun drone on its run, firing. 3: shot down.
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
const shot = async (name, wait = 300) => { await sleep(wait); const f = join(OUT, `drones-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const ROOST = { x: -120, z: 380 };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 11 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: ROOST.x + 8, z: ROOST.z + 10 }); await call('zoom', { level: 'STREET' });
  await call('camera', { view: 'ANGLED', cut: true }).catch(() => null);
  const has = await ev('!!game.skydrones');
  console.log('has sky drones', has);
  if (has) await ev(`(() => { const S = game.skydrones; for (const d of S.drones) d.bat = d.D.battery; return true; })()`);
  await call('step', { seconds: 4 });
  await shot('1-the-roost');
  if (has) {
    // Out where the watcher's loop comes over; it radios you in; the gun drone comes.
    const spot = await ev(`(() => { const S = game.skydrones, N = S.nests.find((n) => n.fid === 'dustwolves'), w = S.drones.find((d) => d.id === N.id + ':watcher'); const a = w.loopA + 0.5; return { x: N.at.x + Math.cos(a) * N.loop, z: N.at.z + Math.sin(a) * N.loop }; })()`);
    await call('teleport', spot); await call('zoom', { level: 'STREET' });
    await call('camera', { view: 'TOPDOWN', cut: true }).catch(() => null);
    for (let i = 0; i < 80; i++) { await call('step', { seconds: 0.25 }); if (await ev(`(() => { const S = game.skydrones, p = game.player; return S.counts.shots > 3 && S.drones.some((d) => d.kind === 'striker' && d.state === 'hunt' && Math.hypot(d.x - p.x, d.z - p.z) < 18) && S.drones.some((d) => d.kind === 'watcher' && Math.hypot(d.x - p.x, d.z - p.z) < 5); })()`)) break; }
    await shot('2-the-gun-run', 0);
    console.log(JSON.stringify(await ev('game.skydrones.view().filter((d) => d.nest === "dustwolf_roost")')), JSON.stringify(await ev('({ x: game.player.x, z: game.player.z })')));
    const s = await ev(`(() => { const d = game.skydrones.drones.find((q) => q.kind === 'striker' && q.state === 'hunt'); return d ? { x: d.x, z: d.z } : null; })()`);
    if (s) {
      for (let k = 0; k < 30; k++) { const d = await ev(`(() => { const q = game.skydrones.drones.find((x) => x.kind === 'striker' && x.nest.fid === 'dustwolves'); return { x: q.x, z: q.z, st: q.state }; })()`); if (d.st !== 'hunt') break; await call('fire', { x: d.x, z: d.z, shots: 1 }).catch(() => null); await call('step', { seconds: 0.1 }); }
      await call('step', { seconds: 0.4 });
      await shot('3-shot-down', 0);
    }
  }
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
