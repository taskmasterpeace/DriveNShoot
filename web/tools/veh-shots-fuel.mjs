#!/usr/bin/env node
// VEHICLES V2 proof shots (docs/status/vehicles-v2.md): the same staging on any build, so before and after compare.
// A real headless Chrome page (the DOM HUD is in these, unlike `screenshot`), on the dev server already up at DL_URL.
//   DL_URL=http://localhost:<port> node tools/veh-shots-fuel.mjs fuel <outdir> [before|after]
// Stops exactly the Chrome it started (shard-kit startHarness).
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const [slice = 'fuel', outArg = 'shots', tag = 'after'] = process.argv.slice(2);
const OUT = resolve(outArg); mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?agent=0', width: 1280, height: 720, log: () => {} });
const D = await cdp(h);
const until = async (expr, ms = 120000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } return false; };
const call = async (cmd, args = {}) => JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`));
const ev = async (code) => JSON.parse(await D.eval(`(() => JSON.stringify(${code}))()`));
const shot = async (name) => { await sleep(700); const f = join(OUT, `${slice}-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });

  if (slice === 'fuel') {
    // The furnace station's fill caps: the diesel caps if this build has them, else its only tank.
    const sp = await ev(`(() => { const R = game.streamer.W.roadside; const t = R.tanks.find((q) => q.site === 'furnace_fuel' && q.fuel === 'diesel') ?? R.tanks.find((q) => q.site === 'furnace_fuel' && q.kind === 'tank'); return { x: t.x, z: t.z, id: t.id }; })()`);
    await call('teleport', { x: sp.x + 4.5, z: sp.z - 4 });
    await call('step', { seconds: 1 });
    const r = await call('spawnVehicle', { type: 'semi', x: sp.x + 5.5, z: sp.z + 3, heading: 0 });
    await ev(`(() => { const I = game.inventory; if (!I.hasTag('hose')) I.add(I.carried, 'siphon_hose', 1); const v = game.vehicles.find((q) => q.id === '${r.id}'); v.fuel = 30; return true; })()`);
    await call('teleport', { x: sp.x + 0.3, z: sp.z + 0.2 });
    await call('step', { seconds: 1.5 });
    console.log('prompt', await ev(`document.querySelector('.prompt, #prompt, .hud-prompt')?.innerText ?? null`));
    await shot('1-caps');
    // Siphon: press E at the caps (the real input).
    await ev(`(() => { game.input.down.add('KeyE'); game.input.pressed.add('KeyE'); return true; })()`);
    await call('step', { seconds: 0.1 });
    await ev(`(() => { game.input.down.delete('KeyE'); return true; })()`);
    await call('step', { seconds: 0.6 });
    await shot('2-siphoned');
    console.log('semi', await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${r.id}'); return { fuel: Math.round(v.fuel), type: v.fuelType ?? null }; })()`));
    await call('enterVehicle', { id: r.id, force: true });
    await call('step', { seconds: 1.5 });
    console.log('dash', await ev(`[...document.querySelectorAll('.sp-bars .st-label')].map((e) => e.textContent)`));
    await shot('3-cab');
    // A sedan with a diesel can poured in: the dash and the toast.
    await call('exitVehicle', {});
    const c = await call('spawnVehicle', { type: 'sedan', x: sp.x - 6, z: sp.z - 8, heading: 0 });
    await call('enterVehicle', { id: c.id, force: true });
    await ev(`(() => { const v = game.player.inVehicle; v.fuel = 12; const I = game.inventory; I.carried.cap = 999; let can = 'diesel_can'; try { I.add(I.carried, can, 1); } catch {} if (!I.carried.slots.some((s) => s.id === can)) { can = 'fuel_can'; I.add(I.carried, can, 1); } const i = I.carried.slots.findIndex((s) => s.id === can && s.left > 0); const r = I.use(i); game.hud.toast((r.text ?? r.why ?? '').toUpperCase(), 'warn'); return r; })()`);
    await ev(`(() => { game.input.down.add('KeyW'); return true; })()`);
    await call('step', { seconds: 1.2 });
    await ev(`(() => { game.input.down.delete('KeyW'); return true; })()`);
    console.log('sedan', await ev(`(() => { const v = game.player.inVehicle; return { fuel: Math.round(v.fuel), bad: v.bad ?? null, speed: Math.round(Math.hypot(v.vx, v.vz)) }; })()`));
    await shot('4-wrong-fuel');
  }
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
