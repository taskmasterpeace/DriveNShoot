#!/usr/bin/env node
// VEHICLES V2 slice 5 proof shots, THE SUV IN THE 18-WHEELER: the same staging on any build, so before and after compare.
//   DL_URL=http://localhost:<port> node tools/veh-shots-suv.mjs <outdir> [before|after]
// A real headless Chrome page (the DOM HUD is in these); held keys through the game's input; stops the Chrome it started.
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
const shot = async (name) => { await sleep(400); const f = join(OUT, `suv-${tag}-${name}.png`); await D.shot(f); console.log('wrote', f); };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  // A parked LONGHAULER and box trailer, its ramp down; the SUV behind it (if this build has one).
  const st = await ev(`(() => { const S = game.semis, r = S.spawnRig('box', 178, -452, Math.PI / 2); S.setRamp(r.T, true); const tip = S.tipZ(r.T); const w = { x: r.T.x + Math.sin(r.T.h) * (tip - 8), z: r.T.z + Math.cos(r.T.h) * (tip - 8) }; window._rig = r; return { w, h: r.T.h, hasSuv: !!game.vehiclesSys && !!(window.__V = null) || true }; })()`);
  const r = await call('spawnVehicle', { type: 'suv', x: st.w.x, z: st.w.z, heading: st.h, paint: '#5d6a52' });
  console.log('suv', r.ok === false ? r.error : r.id ?? r.vehicle?.id);
  await call('teleport', { x: st.w.x + 4, z: st.w.z - 2 });
  await ev(`(() => { const p = game.player; let n = 0; for (const c of [...game.chars]) if (c !== p && c.faction === 'raider' && Math.hypot(c.x - p.x, c.z - p.z) < 260) { game.removeChar(c); n++; } return n; })()`); // a quiet picture: the raiders round here are taken off the board for it
  await call('zoom', { level: 'CLOSE' });
  await call('step', { seconds: 2.5 });
  await shot('1-at-the-ramp');
  if (r.ok !== false) {
    const id = r.id;
    await call('enterVehicle', { id, force: true });
    for (let f = 0; f < 60 * 10; f++) {
      const s = await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${id}'); const sp = v.vx * Math.sin(v.h) + v.vz * Math.cos(v.h); const I = game.input; I.down.delete('KeyW'); I.down.delete('KeyS'); if (sp < 1.8) I.down.add('KeyW'); else if (sp > 3.8) I.down.add('KeyS'); return { lz: v.carry?.lz ?? null, c: !!v.carriedBy }; })()`);
      await call('step', { seconds: 1 / 60 });
      if (f === 150) await shot('2-up-the-ramp');
      if (s.c && s.lz > 4) break;
    }
    await ev(`(() => { game.input.down.delete('KeyW'); game.input.down.add('KeyS'); return true; })()`); await call('step', { seconds: 0.8 }); await ev(`(() => { game.input.down.delete('KeyS'); return true; })()`);
    await call('step', { seconds: 0.5 });
    console.log('in the hold', await ev(`(() => { const v = game.vehicles.find((q) => q.id === '${id}'); return { carried: !!v.carriedBy, y: +(v.y ?? 0).toFixed(2), cargo: window._rig.T.cargo.length }; })()`));
    await shot('3-in-the-hold');
  }
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
