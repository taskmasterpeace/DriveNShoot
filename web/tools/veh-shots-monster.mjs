#!/usr/bin/env node
// VEHICLES V2 slice 9 proof shots, THE MONSTER TRUCK: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-monster.mjs <outdir> [before|after]
// Before: a pickup on MONSTER TYRES (what a monster truck was). After: the monster truck body beside it, and one going over a car.
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
const shot = async (name) => { await sleep(400); const f = join(OUT, `monster-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const YARD = { x: 250, z: 470 };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 11 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: YARD.x, z: YARD.z - 5 }); await call('zoom', { level: 'CLOSE' });
  // A pickup on monster tyres (the old way), and - on a build that has one - the monster truck beside it.
  await ev(`(() => { const p = game.vehiclesSys.spawn('pickup', ${YARD.x - 4}, ${YARD.z}, 0, '#c8a032'); game.workshop.install(p, { part: 'monster', pay: false, time: false });
    window._m = game.monsters ? game.vehiclesSys.spawn('monster_truck', ${YARD.x + 4}, ${YARD.z}, 0, '#c8a032') : null; return true; })()`);
  await call('step', { seconds: 1.5 });
  await shot('1-side-by-side');
  console.log('has monster truck', await ev('!!window._m'));
  // The Dust Bowl, where the arena's truck is parked.
  await call('teleport', { x: 400, z: 110 }); await call('step', { seconds: 1 });
  const parked = await ev(`(() => { const v = game.vehicles.find((q) => q.monsterRow); return v ? { x: v.x, z: v.z } : null; })()`);
  console.log('parked', parked);
  if (parked) { await call('teleport', { x: parked.x - 5, z: parked.z - 5 }); }
  await call('step', { seconds: 1.5 });
  await shot('2-the-dust-bowl');
  // Flat out at a car broadside: up and over (the monster truck, or the pickup on tyres before).
  await call('teleport', { x: YARD.x - 6, z: YARD.z - 46 }); await call('step', { seconds: 1 });
  const r = await ev(`(() => { const m = game.vehiclesSys.spawn(window._m ? 'monster_truck' : 'pickup', ${YARD.x}, ${YARD.z - 40}, Math.PI / 2, '#c8a032'); if (!window._m) game.workshop.install(m, { part: 'monster', pay: false, time: false }); window._c = game.vehiclesSys.spawn('sedan', ${YARD.x + 26}, ${YARD.z - 40}, 0, '#777'); return m.id; })()`);
  console.log('enter', await call('enterVehicle', { id: String(r), force: true })); await call('zoom', { level: 'CLOSE' });
  await ev(`(() => { game.driveOverride = { throttle: 1, steer: 0 }; return true; })()`);
  for (let i = 0; i < 40; i++) { await call('step', { seconds: 0.05 }); if (await ev('(game.vehicles.find((q) => q.driver === game.player)?.climbY ?? 0) > 1')) break; }
  await ev(`(() => { game.driveOverride = null; return true; })()`);
  await shot('3-over-a-car');
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
