#!/usr/bin/env node
// VEHICLES V2 slice 7 proof shots, WAGONS: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-wagons.mjs <outdir> [before|after]
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
const shot = async (name) => { await sleep(400); const f = join(OUT, `wagons-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const key = (code, down) => ev(`(() => { const I = game.input; if (${down}) { I.down.add('${code}'); I.pressed.add('${code}'); I.phys.add('${code}'); I.physHit.add('${code}'); } else { I.down.delete('${code}'); I.phys.delete('${code}'); } return true; })()`);
const STABLE = { x: -2486, z: 12 };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: STABLE.x - 6, z: STABLE.z - 6 }); await call('zoom', { level: 'CLOSE' });
  await call('step', { seconds: 2 });
  await shot('1-at-the-stable');
  const w = await ev(`(() => { const v = game.vehicles.find((q) => q.type === 'wagon'); return v ? { id: v.id, x: v.x, z: v.z, h: v.h } : null; })()`);
  console.log('wagon', w);
  if (w) {
    // Your draft horse (bought from the stable: staged here), led to the tongue; E hitches it.
    const t = await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${w.id}'), t = game.wagons.tongue(v, { x: 0, z: 0 }); const H = game.horses.mk('draft', { x: t.x + 2, z: t.z + 1, owner: 'player', saddle: true, bond: 40, name: 'Judge' }); H.tied = { x: H.x, z: H.z }; return t; })()`);
    await call('teleport', { x: t.x + 0.6, z: t.z - 0.4 }); await call('step', { seconds: 1.5 });
    await key('KeyE', true); await call('step', { seconds: 0.05 }); await key('KeyE', false); await call('step', { seconds: 0.6 });
    await shot('2-hitched');
    await call('enterVehicle', { id: w.id, force: true });
    await key('KeyW', true); await call('step', { seconds: 4 }); await key('KeyW', false); await call('step', { seconds: 0.4 });
    await shot('3-on-the-road');
    console.log(await ev(`game.wagons.view()`));
    // Out, round the back, into the bed.
    await call('exitVehicle', {});
    await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${w.id}'), p = game.player; p.x = v.x - Math.sin(v.h) * (v.len / 2 + 0.8); p.z = v.z - Math.cos(v.h) * (v.len / 2 + 0.8); return true; })()`);
    await call('step', { seconds: 0.5 });
    await key('KeyE', true); await call('step', { seconds: 0.05 }); await key('KeyE', false); await call('step', { seconds: 1 });
    console.log('in the bed', await ev(`!!game.player.onDeck`));
    await shot('4-in-the-bed');
  }
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
