#!/usr/bin/env node
// VEHICLES V2 slice 2 proof shots, GUNS ON BOATS: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-boats.mjs <outdir> [before|after]
// A real headless Chrome page (the DOM HUD is in these), on the dev server already up at DL_URL; stops the Chrome it started.
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
const shot = async (name) => { await sleep(500); const f = join(OUT, `boats-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  // The lake gunboat, held still for the picture (its patrol AI aims and fires as it would).
  const gb = await ev(`(() => { const v = game.vehicles.find((q) => q.type === 'gunboat' && q.ai === 'boatPatrol'); return v ? { id: v.id, x: v.x, z: v.z, h: v.h, mounts: v.mounts ?? null } : null; })()`);
  console.log('gunboat', gb);
  // The player in an airboat 22 m off its bow.
  const ab = await call('spawnVehicle', { type: 'airboat', x: gb.x + Math.sin(gb.h) * 22, z: gb.z + Math.cos(gb.h) * 22, heading: gb.h + Math.PI });
  await call('enterVehicle', { id: ab.id, force: true });
  await call('zoom', { level: 'CLOSE' }); await call('step', { seconds: 0.6 });
  let hit = 0;
  for (let i = 0; i < 60 && !hit; i++) { await call('step', { seconds: 0.05 }); hit = await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${gb.id}'); return v?.mounts?.top ? ${'100'} - v.mounts.top.ammo : 0; })()`); }
  await call('step', { seconds: 0.08 });
  await shot('1-under-fire');
  console.log('after', await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${gb.id}'); const a = game.vehicles.find((q) => q.id === '${ab.id}'); return { mount: v?.mounts?.top ?? null, airboatHp: Math.round(a.hp), d: Math.round(Math.hypot(a.x - v.x, a.z - v.z)) }; })()`));
  // At the gunboat's own wheel: the pintle gun swung round to the stern.
  await call('exitVehicle', {});
  // A second gunboat of your own (the workshop's job on this build: a .50 on the pintle if the chassis takes one).
  const mine = await call('spawnVehicle', { type: 'gunboat', x: gb.x - 30, z: gb.z + 25, heading: 0 });
  console.log('mount', await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${mine.id}'); const why = game.garage.canMount(v, 'top', 'hmg'); if (!why) game.garage.setMount(v, 'top', 'hmg'); return why ?? 'hmg on the pintle'; })()`));
  await call('enterVehicle', { id: mine.id, force: true });
  await call('zoom', { level: 'CLOSE' });
  await ev(`(() => { const v = game.player.inVehicle; game.aimOverride = { x: v.x + Math.cos(v.h) * 25, z: v.z - Math.sin(v.h) * 25 + 4 }; game.input.mouse.physRight = true; game.input.mouse.right = true; return true; })()`);
  await call('step', { seconds: 0.6 });
  await shot('2-at-the-wheel');
  await ev(`(() => { game.input.mouse.physRight = false; game.input.mouse.right = false; game.aimOverride = null; return true; })()`);
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
