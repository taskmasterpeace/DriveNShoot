#!/usr/bin/env node
// THE SITES + TERRAIN proof shots (docs/design/WEB_SITES_TERRAIN.md §8): from the GAME camera (the `screenshot` command's
// own camera, the game's tilt) on the running game at DL_URL, into docs/renders/web/sites-terrain/. Each shot is staged
// through real commands (sites goto, teleport, a car on the road), at noon in clear weather so the land reads.
//   DL_URL=http://localhost:3452 node tools/sites-shots.mjs [name ...]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const OUT = join(fileURLToPath(new URL('..', import.meta.url)), '..', 'docs', 'renders', 'web', 'sites-terrain');
mkdirSync(OUT, { recursive: true });
const call = async (cmd, args = {}) => { const r = await fetch(`${BASE}/agent/cmd`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cmd, args }) }); return r.json(); };
const exec = (code) => call('exec', { code });
const shot = async (name, a) => {
  const r = await call('screenshot', { quality: 0.86, ...a });
  if (!r.image) { console.log(name, 'FAILED', JSON.stringify(r).slice(0, 300)); return; }
  writeFileSync(join(OUT, `${name}.jpg`), Buffer.from(r.image.split(',')[1], 'base64'));
  console.log('wrote', name, JSON.stringify(a));
};
const settle = (s = 1.2) => call('step', { seconds: s });
const want = process.argv.slice(2);
const on = (n) => !want.length || want.some((w) => n.includes(w));

await call('start'); await call('god', { on: true });
await call('setTime', { hour: 11.5 }); await call('setWeather', { key: 'CLEAR', instant: true });
await exec('game.citygen.enabled = true, game.fauna && (game.fauna.enabled = false), true');

const siteShot = async (name, id, zoom, tilt = 0.14, dx = 0, dz = 0) => {
  const r = await call('sites', { action: 'goto', id });
  if (!r.ok) { console.log(name, r.error); return; }
  await settle(1.5);
  const rec = await exec(`(() => { const q = game.citygen.siteRows().find((s) => s.id === ${JSON.stringify(id)}); const t = game.citygen.live.get(q.rec); return { x: t.rec.x, z: t.rec.z, half: t.rec.half }; })()`);
  await shot(name, { x: rec.value.x + dx, z: rec.value.z + dz, zoom, tilt });
  console.log(' ', id, JSON.stringify(r.ground));
};

// 1. A Florida site: the star fort on the Atlantic side, and the sawgrass road in the Everglades.
if (on('florida')) {
  await siteShot('1-florida-site-star-fort', 'castillo-st-augustine', 70);
  await siteShot('1b-florida-site-sawgrass-road', 'everglades-shark-valley', 80);
}
// 2. A canyon: the Grand Canyon below the village (the north pack), looking down its wall.
if (on('canyon')) {
  const p = await exec(`(() => { const T = game.streamer.W.terrain, q = game.citygen.siteRows().find((s) => s.id === 'grand-canyon-village');
    let best = null; for (let a = -4000; a <= 4000; a += 100) for (let b = -4000; b <= 4000; b += 100) { const x = q.x + a, z = q.z + b, s = Math.abs(T.landAt(x + 60, z) - T.landAt(x - 60, z)) + Math.abs(T.landAt(x, z + 60) - T.landAt(x, z - 60)); if (!best || s > best.s) best = { x, z, s }; } return best; })()`);
  await call('teleport', { x: p.value.x, z: p.value.z }); await settle(1.5);
  await shot('2-canyon-grand-canyon-wall', { x: p.value.x, z: p.value.z, zoom: 90, tilt: 0.14 });
  await shot('2b-canyon-grand-canyon-low', { x: p.value.x, z: p.value.z, zoom: 140, tilt: 0.9 });
}
// 3. A forest: the Kaibab's conifer belt north of the canyon.
if (on('forest')) {
  const p = await exec(`(() => { const T = game.streamer.W.terrain, q = game.citygen.siteRows().find((s) => s.id === 'grand-canyon-village');
    let best = null; for (let a = -9000; a <= 9000; a += 300) for (let b = -15000; b <= -3000; b += 300) { const x = q.x + a, z = q.z + b; if (T.biomeAt(x, z) !== 'F') continue; let n = 0; for (const [u, v] of [[-300,0],[300,0],[0,-300],[0,300]]) if (T.biomeAt(x + u, z + v) === 'F') n++; if (n === 4 && (!best || Math.hypot(x - 0, z - 0) < Math.hypot(best.x, best.z))) best = { x, z }; } return best; })()`);
  if (p.value) { await call('teleport', { x: p.value.x, z: p.value.z }); await settle(1.5); await shot('3-forest-kaibab', { x: p.value.x, z: p.value.z, zoom: 66, tilt: 0.14 }); }
  else console.log('no forest found');
}
// 4. A mountain road: the steepest graded stretch of I-10, a car climbing it.
if (on('mountain')) {
  const s = await exec(`(() => { const W = game.streamer.W, R = W.terrain.roads[0], cl = W.cl; let best = 0, bs = 0; for (let i = 0; i + 190 < cl.n; i += 10) { if (cl.s[i] < W.sIslE + 3000) continue; const d = Math.abs(R.yr[i + 190] - R.yr[i]); if (d > best) { best = d; bs = cl.s[i]; } } return { s: bs + 750, mile: (bs + 750) / 1609.344 }; })()`);
  await call('teleport', { mile: +s.value.mile.toFixed(2), dir: 'east' });
  const me = await exec('({ x: game.player.x, z: game.player.z, h: game.player.face ?? 0 })');
  const v = await call('spawnVehicle', { type: 'interceptor', x: me.value.x, z: me.value.z, heading: Math.PI / 2 });
  if (v.id) { await call('enterVehicle', { id: v.id, force: true }); await call('drive', { throttle: 0.6, seconds: 2 }); }
  await settle(0.5);
  const at = await exec('({ x: (game.player.inVehicle ?? game.player).x, z: (game.player.inVehicle ?? game.player).z })');
  await shot('4-mountain-road-i10', { x: at.value.x, z: at.value.z, zoom: 66, tilt: 0.14 });
  await shot('4b-mountain-road-i10-wide', { x: at.value.x, z: at.value.z, zoom: 160, tilt: 0.55 });
  if (v.id) await exec('(() => { const v = game.player.inVehicle; if (v) { game.exitVehicle(true); game.vehiclesSys.remove(v); } return true; })()');
}
// 5. A site set-piece in its biome: the canyon-rim village on the Grand Canyon's lip.
if (on('setpiece')) await siteShot('5-setpiece-canyon-rim-village', 'grand-canyon-village', 90);
await call('teleport', { x: 0, z: -40 });
