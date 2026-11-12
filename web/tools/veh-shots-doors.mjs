#!/usr/bin/env node
// VEHICLES V2 slice 3 proof shots, CAR DOORS: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-doors.mjs <outdir> [before|after]
// A real headless Chrome page on the dev server already up at DL_URL; real key presses (F) through the game's input; stops
// the Chrome it started.
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
const shot = async (name) => { await sleep(400); const f = join(OUT, `doors-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const key = async (code, down) => ev(`(() => { const I = game.input; if (${down}) { I.down.add('${code}'); I.pressed.add('${code}'); I.phys.add('${code}'); I.physHit.add('${code}'); } else { I.down.delete('${code}'); I.phys.delete('${code}'); } return true; })()`);
const doors = (id) => ev(`(() => { const v = game.vehicles.find((q) => q.id === '${id}'); return v.doors ? Object.fromEntries(Object.entries(v.doors).map(([k, d]) => [k, +d.a.toFixed(2)])) : null; })()`);

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 11 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: 0, z: -70 });
  const r = await call('spawnVehicle', { type: 'sedan', x: 6, z: -70, heading: Math.PI / 2, paint: '#2f5e7a' });
  await call('zoom', { level: 'CLOSE' });
  const at = await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${r.id}'); return game.seats.doorPos(v, 0, 0.9); })()`);
  await call('teleport', { x: at.x, z: at.z }); await call('step', { seconds: 0.6 });
  // 1: in with F held through the beat: the door stays open.
  await key('KeyF', true); await call('step', { seconds: 0.05 });
  await call('step', { seconds: 1.4 });
  await shot('1-in-holding-the-door');
  console.log('held', await doors(r.id));
  await key('KeyF', false); await call('step', { seconds: 1 });
  // 2: out (tap F): the door is left open, you stand beside it.
  await key('KeyF', true); await call('step', { seconds: 0.05 }); await key('KeyF', false);
  await call('step', { seconds: 0.4 });
  await ev(`(() => { const p = game.player; p.x -= 1.4; p.z += 1.6; return true; })()`); await call('step', { seconds: 0.6 });
  await shot('2-out-door-left-open');
  console.log('out', await doors(r.id));
  // 3: in with a tap: it shuts a beat later.
  await call('teleport', { x: at.x, z: at.z }); await call('step', { seconds: 0.3 });
  await key('KeyF', true); await call('step', { seconds: 0.05 }); await key('KeyF', false);
  await call('step', { seconds: 0.3 });
  await shot('3-tap-in-door-swinging');
  await call('step', { seconds: 1.5 });
  await shot('4-a-beat-later-shut');
  console.log('shut', await doors(r.id));
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
