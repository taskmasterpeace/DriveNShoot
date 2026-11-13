#!/usr/bin/env node
// VEHICLES V2 proof shots, DAMAGE YOU FEEL: the same staging on any build, the HUD hidden (each state must read without it).
//   DL_URL=http://localhost:<port> node tools/veh-shots-dmgfeel.mjs <outdir> [before|after]
// 1 a front-left flat on its rim, driven: the sag, the sparks. 2 a caved front with its bumper hanging, smoking. 3 a boiled
// engine, seized: the steam. 4 on your knees at the flat wheel, changing it.
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
const shot = async (name, wait = 250) => { await sleep(wait); const f = join(OUT, `dmgfeel-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const YARD = { x: 250, z: 400 }, LOT = { x: 120, z: -20 };
// A sedan, hurt by `stage` (a JS body with d = its dmg), you at its wheel (or beside it).
const make = async (at, stage, drive = true) => {
  await call('teleport', { x: at.x - 5, z: at.z }); await call('step', { seconds: 0.3 });
  const id = await ev(`(() => { const v = game.vehiclesSys.spawn('sedan', ${at.x}, ${at.z}, 0, '#3f5f6e'); const d = v.dmg; game.dmgFeel?.ensure(d); ${stage}; d.dirty = true; window._v = v; return v.id; })()`);
  if (drive) { await call('enterVehicle', { id, force: true }); }
  await call('zoom', { level: 'CLOSE' }); await call('camera', { view: 'ANGLED', mode: drive ? 'drive' : 'foot', d: drive ? 11 : 14, cut: true }).catch(() => null);
  return id;
};
const hold = async (key, secs) => { await ev(`(() => { game.input.down.add('${key}'); return true; })()`); await call('step', { seconds: secs }); };
const release = async () => ev(`(() => { for (const k of ['KeyW','KeyE','KeyS']) game.input.down.delete(k); return true; })()`);
// Out of the car and a few steps off its side: a bystander's close look (the drive camera sits too high to see a sag).
const look = async (dx, dz) => { await release(); await ev(`(() => { game.exitVehicle(true); const v = window._v; game.player.x = v.x + (${dx}); game.player.z = v.z + (${dz}); return true; })()`); await call('camera', { view: 'ANGLED', mode: 'foot', d: 9, cut: true }).catch(() => null); await call('step', { seconds: 0.5 }); };
const clear = async () => { await release(); await ev(`(() => { if (game.player.inVehicle) game.exitVehicle(true); if (window._v) game.vehiclesSys.remove(window._v); return true; })()`); };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 11 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await ev(`(() => { game.hud.root.style.display = 'none'; return true; })()`); // the HUD off
  await make(YARD, `d.tyres.FL = 0; if (d.rim) d.rim.FL = 0`);
  await hold('KeyW', 1.6);
  await shot('1-flat-on-the-rim', 0);
  await look(3.5, 3); await shot('1b-flat-on-the-rim-close', 0); await clear();
  await make(YARD, `d.zones.front = 0.55; d.engine = 0.18`);
  await hold('KeyW', 1.4);
  await shot('2-bumper-dragging-smoking', 0);
  await look(3, 5); await shot('2b-bumper-hanging-close', 0); await clear();
  await make(YARD, `d.radiator = 0; d.temp = 1.3`);
  await hold('KeyW', 1.0); await release(); await call('step', { seconds: 0.3 });
  await ev(`(() => { game.exitVehicle(true); const v = window._v; game.player.x = v.x + 5; game.player.z = v.z - 3; return true; })()`); // a bystander's view
  await call('camera', { view: 'ANGLED', mode: 'foot', d: 12, cut: true }).catch(() => null); await call('step', { seconds: 0.8 });
  await shot('3-boiled-and-seized', 0); await clear();
  await make(LOT, `d.tyres.FR = 0`, false);
  await ev(`(() => { const v = window._v, I = game.inventory; I.add(I.trunk(v), 'spare_tyre', 1); I.stow('car_jack', 1); const q = game.dmgFeel ? game.dmgFeel.spot(v, 'wheel', 'FR') : { x: v.x - 1.5, z: v.z + 1.2 }; game.player.x = q.x; game.player.z = q.z; return true; })()`);
  await call('step', { seconds: 0.3 });
  await hold('KeyE', 4);
  await shot('4-changing-the-tyre', 0); await clear();
  console.log('feel counts', JSON.stringify(await ev('game.dmgFeel?.counts ?? null')));
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
