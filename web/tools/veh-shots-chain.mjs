#!/usr/bin/env node
// VEHICLES V2 slice 4 proof shots, CHAIN TOWING ON FOOT: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-chain.mjs <outdir> [before|after]
// A real headless Chrome page on the dev server already up at DL_URL (the DOM HUD and its prompts are in these); E held
// through the game's own input; stops the Chrome it started.
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
const shot = async (name) => { await sleep(400); const f = join(OUT, `chain-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };
const key = (code, down) => ev(`(() => { const I = game.input; if (${down}) { I.down.add('${code}'); I.pressed.add('${code}'); I.phys.add('${code}'); I.physHit.add('${code}'); } else { I.down.delete('${code}'); I.phys.delete('${code}'); } return true; })()`);
const end = (id, e, out = 0.9) => ev(`(() => { const v = game.vehicles.find((q) => q.id === '${id}'); const o = ${e} > 0 ? v.len / 2 + ${out} : -(v.len / 2 + ${out}); return { x: v.x + Math.sin(v.h) * o, z: v.z + Math.cos(v.h) * o }; })()`);
const prompt = () => ev(`document.querySelector('.prompt, #prompt, .hud-prompt')?.innerText ?? null`);

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 11 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await ev(`(() => { const I = game.inventory; I.carried.cap = Math.max(I.carried.cap, 200); I.add(I.carried, 'tow_chain', 1); return I.carried.count('tow_chain'); })()`);
  const truck = await call('spawnVehicle', { type: 'pickup', x: 0, z: -70, heading: Math.PI, paint: '#7a4a24' });
  const dead = await call('spawnVehicle', { type: 'sedan', x: 0, z: -70 + 2.5 + 3.6 + 2.4, heading: Math.PI, paint: '#2f5e7a' });
  await call('zoom', { level: 'CLOSE' });
  const tail = await end(truck.id, -1);
  await call('teleport', tail); await call('step', { seconds: 0.5 });
  console.log('at the tail:', await prompt());
  await key('KeyE', true); await call('step', { seconds: 1.5 }); await key('KeyE', false); await call('step', { seconds: 0.2 });
  // Walk the free end toward the dead car's nose (staged steps for the picture).
  const nose = await end(dead.id, 1);
  await ev(`(() => { const p = game.player; p.x = ${(tail.x + nose.x) / 2 + 1.2}; p.z = ${(tail.z + nose.z) / 2}; return true; })()`); await call('step', { seconds: 0.3 });
  await shot('1-carrying-the-chain');
  console.log('carry', await ev(`game.towing?.carry ? game.towing.carry.kind : null`));
  await call('teleport', nose); await call('step', { seconds: 0.3 });
  console.log('at the nose:', await prompt());
  await key('KeyE', true); await call('step', { seconds: 1.5 }); await key('KeyE', false); await call('step', { seconds: 0.2 });
  console.log('links', await ev(`(game.towing?.links ?? []).map((l) => l.kind + ':' + l.a.type + '>' + l.b.type)`));
  await shot('2-chained');
  // Into the truck and away: the sedan comes along.
  await call('enterVehicle', { id: truck.id, force: true });
  await key('KeyW', true); await call('step', { seconds: 2.5 }); await key('KeyW', false); await call('step', { seconds: 0.2 });
  console.log('after the pull', await ev(`(() => { const d = game.vehicles.find((q) => q.id === '${dead.id}'); return { x: +d.x.toFixed(1), z: +d.z.toFixed(1) }; })()`));
  await shot('3-towing');
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
