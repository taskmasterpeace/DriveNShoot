#!/usr/bin/env node
// VEHICLES V2 slice 6 proof shots, HORSES + THE CAVALRY COMPANY: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-cavalry.mjs <outdir> [before|after]
// A real headless Chrome page on the dev server already up at DL_URL; stops the Chrome it started.
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
const shot = async (name) => { await sleep(400); const f = join(OUT, `cavalry-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const POST = { x: -3150, z: 380 };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 9 }); await call('setWeather', { key: 'CLEAR', instant: true });
  // Outside the post's gate.
  await call('teleport', { x: POST.x - 4, z: POST.z - 34 });
  await call('step', { seconds: 3 });
  await shot('1-the-post');
  console.log(await ev(`game.cavalry ? game.cavalry.view() : 'no cavalry on this build'`));
  // The patrol: stand where its loop runs and let it come by.
  const lead = await ev(`(() => { const S = game.cavalry?.posts?.[0]; const r = S?.people.find((q) => q.kind === 'patrol' && q.c?.mount); return r ? { x: r.c.x, z: r.c.z } : null; })()`);
  if (lead) {
    await call('teleport', { x: lead.x + 8, z: lead.z + 5 }); await call('zoom', { level: 'CLOSE' });
    await call('step', { seconds: 1.5 });
    await shot('2-the-patrol');
    // A Dustwolf in their sight.
    await ev(`(() => { const p = game.player, r = game.spawnRaider(p.x + 26, p.z - 10, Math.random, 'pistol'); window._dw = r; return !!r; })()`);
    await call('step', { seconds: 1.2 });
    await shot('3-they-turn-on-a-raider');
    await call('step', { seconds: 4 });
    console.log('raider', await ev(`window._dw ? { alive: window._dw.alive, hp: Math.round(window._dw.hp) } : null`));
  }
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
