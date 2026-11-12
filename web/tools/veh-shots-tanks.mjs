#!/usr/bin/env node
// VEHICLES V2 slice 8 proof shots, TANKS: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-tanks.mjs <outdir> [before|after]
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
const shot = async (name) => { await sleep(400); const f = join(OUT, `tanks-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const YARD = { x: 250, z: 430 };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 11 }); await call('setWeather', { key: 'CLEAR', instant: true });
  // The old tank where it stands near Rust Haven (if this build has one).
  const old = await ev(`(() => { const v = game.vehicles.find((q) => q.type === 'tank_old'); return v ? { x: v.x, z: v.z } : null; })()`);
  console.log('old tank', old);
  await call('teleport', old ? { x: old.x - 6, z: old.z - 6 } : { x: 46, z: -50 }); await call('zoom', { level: 'STREET' });
  await call('step', { seconds: 1.5 });
  await shot('1-the-old-tank');
  // The main battle tank in the yard, its gun on a car.
  const r = await call('spawnVehicle', { type: 'tank_new', x: YARD.x, z: YARD.z, heading: 0, paint: '#6a6448' });
  if (r.ok !== false) {
    await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${r.id}'); game.garage.setMount(v, 'top', 'cannon120'); v.mounts.top.ammo = 3; window._car = game.vehiclesSys.spawn('sedan', ${YARD.x + 30}, ${YARD.z + 18}, 0, '#7a7a70'); return true; })()`);
    await call('enterVehicle', { id: r.id, force: true }); await call('zoom', { level: 'STREET' });
    await ev(`(() => { game.aimOverride = { x: window._car.x, z: window._car.z }; return true; })()`);
    await call('step', { seconds: 1 });
    await shot('2-the-turret-on-a-car');
    await ev(`(() => { game.input.mouse.physRight = true; game.input.mouse.right = true; return true; })()`);
    await call('step', { seconds: 0.35 });
    await ev(`(() => { game.input.mouse.physRight = false; game.input.mouse.right = false; return true; })()`);
    await call('step', { seconds: 0.15 });
    await shot('3-the-shell-hits');
    console.log('car', await ev(`({ hp: Math.round(window._car.hp), dead: !!window._car.dead })`));
    // From outside: the tank, its turret still laid on the wreck.
    await call('exitVehicle', {}); await ev(`(() => { const p = game.player; p.x = ${YARD.x} - 9; p.z = ${YARD.z} - 7; return true; })()`);
    await call('step', { seconds: 1.2 });
    await shot('4-from-outside');
  } else console.log('no tank_new on this build');
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
