#!/usr/bin/env node
// WEATHER & SEASONS AUDIT (Robert 11-12: "fix the world map and accessibility and weather and seasons"). Plays a year in
// four places at high time speed and records what the game does each season, then probes the suspected faults directly.
//   DL_URL=http://localhost:<port> node tools/weather-audit.mjs <outdir>
// Writes <outdir>/audit.json and screenshots <outdir>/wx-*.png. A real headless Chrome page on the dev server at DL_URL.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const OUT = resolve(process.argv[2] ?? 'wx-audit'); mkdirSync(OUT, { recursive: true });
const h = await startHarness(PORT, { path: '/?agent=0', width: 1280, height: 720, log: () => {} });
const D = await cdp(h);
const until = async (expr, ms = 120000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } return false; };
const call = async (cmd, args = {}) => JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`));
const ev = async (code) => JSON.parse(await D.eval(`(async () => JSON.stringify(await (async () => { ${code} })()))()`));
const shot = async (name) => { await sleep(300); const f = join(OUT, `wx-${name}.png`); await D.shot(f); console.log('wrote', f); return `wx-${name}.png`; };

const PLACES = [
  { id: 'phoenix', name: 'Phoenix desert (Glass Flats)', world: { x: 250, z: 430 } },
  { id: 'pass', name: 'the Mogollon Rim pass (AZ-87), the one pass inside the playable world', pass: 'mogollon' },
  { id: 'florida', name: 'Florida coast (Miami)', lat: 25.8, lon: -80.25 },
  { id: 'north', name: 'the far north of the playable world (the dust wall due north of Phoenix)', world: { x: 0, z: -43500 } },
];
const SEASONS = ['winter', 'spring', 'summer', 'autumn'];
const out = { places: {}, probes: {} };

try {
  await until('window.game && game.hud && game.api');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  // The full game: the seasons live and the climate profile on (the agent page starts neutral).
  await ev(`const g = game; g.survival.setProfile?.('full'); g.seasons.neutral = false; g.seasons.live = true; return true;`);
  for (const P of PLACES) {
    const at = await ev(`
      const S = await import('/src/systems/seasons.js'), G = await import('/src/world/geo.js');
      ${P.world ? `return ${JSON.stringify(P.world)};` : P.pass ? `const p = (await import('/src/data/seasons.js')).PASSES.find((q) => q.id === '${P.pass}'); const [x, z] = game.seasons.passWorld(p); return { x, z };` : `const [x, z] = G.toWorld(S.fromLatLon(${P.lat}, ${P.lon})); return { x, z };`}`);
    P.at = { x: Math.round(at.x), z: Math.round(at.z) };
    out.places[P.id] = { name: P.name, at: P.at, seasons: {} };
    await call('teleport', P.at); await call('step', { seconds: 3 });
    for (const s of SEASONS) {
      const r = await ev(`
        const g = game, S = g.seasons; S.setSeason('${s}', 0.5); await g.api.call('setTime', { hour: 12 }); await g.api.call('step', { seconds: 2 });
        const v = S.view(), H = S.here, roll = {}; for (let i = 0; i < 400; i++) { const k = S.pickWeather() ?? 'null'; roll[k] = (roll[k] ?? 0) + 1; }
        const noon = g.survival.airAt(14, 'CLEAR'), dawn = g.survival.airAt(5, 'CLEAR'), road = S.roadAt(g.player.x, g.player.z);
        const pw = S.plantingWindow('default'); const pass = S.passAt(g.player.x, g.player.z);
        return { zone: H.zoneName, local: H.localLabel, lat: H.lat, mean: H.mean, airNoon: +noon.toFixed(1), airDawn: +dawn.toFixed(1), dayLen: +H.dayLen.toFixed(1), frost: H.frost,
          pack: +H.pack.toFixed(2), cover: +S.cover.toFixed(2), leaf: +H.cover.toFixed(2), turn: +H.turn.toFixed(2), road: road.kind, grip: road.grip, pass, weatherRoll: roll,
          growth: S.growthFactor(), planting: pw.why, fauna: +S.fauna('*').toFixed(2), forecast: S.forecast('radio').text, chip: S.chip() };`);
      out.places[P.id].seasons[s] = r;
      console.log(P.id, s, JSON.stringify(r).slice(0, 220));
      if (s === 'winter' || s === 'summer') {
        // The likeliest wet kind for the place and season, made to fall, at noon: what you would see.
        const wet = await ev(`const S = game.seasons, o = S.here.odds; let best = 'CLEAR', bw = -1; for (const k of ['RAIN', 'STORM', 'DUST', 'FOG']) if (o[k] > bw) { bw = o[k]; best = k; } const kind = S.kindFor(best); game.sky.setWeather(kind); return kind;`);
        await call('step', { seconds: 8 });
        out.places[P.id].seasons[s].shownWeather = wet;
        out.places[P.id].seasons[s].shot = await shot(`${P.id}-${s}-${wet.toLowerCase()}`);
        await ev(`game.sky.setWeather('CLEAR'); return true;`); await call('step', { seconds: 6 });
      }
    }
  }

  // ---- the probes ----
  // 1 One sky for the whole map: rain in Phoenix, then a jump to the far north in deep winter: still RAIN at well below freezing.
  await call('teleport', out.places.phoenix.at); await call('step', { seconds: 2 });
  await ev(`game.seasons.setSeason('winter', 0.5); game.sky.setWeather('RAIN'); return true;`); await call('step', { seconds: 6 });
  await call('teleport', out.places.north.at); await call('step', { seconds: 4 });
  out.probes.globalSky = await ev(`const g = game; return { key: g.sky.weatherKey, rain: +g.sky.cur.rain.toFixed(2), air: +g.survival.airAt(g.sky.time).toFixed(1), zone: g.seasons.here.zoneName };`);
  out.probes.globalSky.shot = await shot('probe-rain-at-minus-temp-north');
  // 2 Rain indoors: under a roof the streaks still fall (the rain box follows the camera, nothing knows about roofs).
  await call('teleport', { x: 0, z: -40 }); await call('step', { seconds: 3 });
  const inside = await ev(`
    const g = game; const bs = (g.world.buildings ?? []).filter((b) => b.enterable && b.roofIdx?.length && b.maxX - b.minX > 7 && b.maxZ - b.minZ > 7).map((b) => ({ x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2, id: b.id ?? b.label ?? null }));
    const p = g.player; let best = null, bd = 1e9; for (const b of bs) { const d = Math.hypot(b.x - p.x, b.z - p.z); if (d < bd) { bd = d; best = b; } }
    return best ? { x: best.x, z: best.z, id: best.id ?? null } : null;`);
  if (inside) {
    await call('teleport', inside); await call('step', { seconds: 2 });
    await ev(`game.sky.setWeather('RAIN'); return true;`); await call('step', { seconds: 6 });
    out.probes.indoorRain = await ev(`const g = game; return { inside: !!g.insideBuilding, rainVisible: g.sky.rain.visible, streaks: g.sky.rain.geometry.drawRange.count / 2, wetFloor: +g.sky.cur.rain.toFixed(2) };`);
    out.probes.indoorRain.shot = await shot('probe-rain-indoors');
  } else out.probes.indoorRain = { note: 'no building found near Rust Haven' };
  // 3 How fast a front arrives: CLEAR to FOG, the fog density every second.
  await ev(`game.sky.setWeather('CLEAR'); return true;`); await call('step', { seconds: 10 });
  const fogT = []; await ev(`game.sky.setWeather('FOG'); return true;`);
  for (let i = 0; i < 8; i++) { await call('step', { seconds: 1 }); fogT.push(await ev(`return +game.sky.cur.fog.toFixed(4);`)); }
  out.probes.frontArrival = { target: 0.026, perSecond: fogT };
  // 4 What a storm does: grip, sight (AI), hearing, the HUD; and the thunder.
  out.probes.stormEffects = await ev(`
    const g = game; g.sky.setWeather('STORM'); await g.api.call('step', { seconds: 6 });
    const road = g.seasons.roadAt(g.player.x, g.player.z), sight = g.ai?.sightRange?.() ?? null;
    return { key: g.sky.weatherKey, label: g.sky.label, rain: +g.sky.cur.rain.toFixed(2), roadGrip: road.grip, roadKind: road.kind, aiSightFn: sight, thunder: typeof g.audio?.thunder };`);
  // 5 The roll's clock: real seconds, not game time or place.
  out.probes.rollClock = await ev(`return { nextWeatherIn: +game.sky.nextWeatherIn.toFixed(1), fast: game.sky.fast };`);
  await ev(`game.sky.setWeather('CLEAR'); return true;`);
  writeFileSync(join(OUT, 'audit.json'), JSON.stringify(out, null, 1));
  console.log('wrote audit.json');
} finally { h.stop?.(); await D.close?.(); }
process.exit(0);
