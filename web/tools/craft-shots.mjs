#!/usr/bin/env node
// THE MAKER's renders (docs/design/WEB_CRAFTING.md): a real headless Chrome on the game at 1920x1080 with the DOM (the CRAFT tab
// is in these, unlike `screenshot`). Writes docs/renders/web/crafting/*.png.
//   DL_URL=http://localhost:3428 node tools/craft-shots.mjs [--size 1920x1080]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1920x1080').split('x').map(Number);
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'crafting');
mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?agent=0', width: W, height: H, log: console.log });
const D = await cdp(h);
await D.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const until = async (expr, ms = 60000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const shot = async (name) => { await sleep(700); const f = join(OUT, `${name}.png`); await D.shot(f); console.log('wrote', f); };
const call = (cmd, args = {}) => D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`);
const recentre = `const p = game.player, C = game.crafting; C.placed.forEach((b, i) => { const a = 0.4 + i * 2.09; b.x = p.x + Math.cos(a) * 2.4; b.z = p.z + Math.sin(a) * 2.4; C.meshes.get(b.id)?.position.set(b.x, 0, b.z); }); p.speed = 0;`;
const js = (code) => D.eval(`(async () => { ${code} ; return true; })()`);
try {
  await until('window.game && game.crafting && game.craftUI');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: 240, z: -330 });
  await js(`
    const g = game, inv = g.inventory, c = inv.carried; c.cap = 9999;
    const give = (id, n = 1, st = {}) => inv.add(c, id, n, st);
    for (const [id, n] of [['cloth_scrap', 9], ['wood_scrap', 5], ['nails', 80], ['scrap', 6], ['charcoal', 3], ['plant_fibre', 14], ['tallow', 3], ['herbs', 5], ['cord', 4], ['brass_case', 16], ['lead_shot', 2], ['gunpowder', 2], ['primer', 16], ['beans_tin', 2], ['jerky', 2]]) give(id, n);
    give('hammer', 1, { cond: 0.82 }); give('hand_saw', 1, { cond: 0.64 }); give('metal_file', 1, { cond: 0.9 }); give('needle_kit', 1, { cond: 0.5 }); give('whetstone', 1, { cond: 0.35 });
    give('knife', 1, { cond: 0.42 }); give('workbench'); give('forge_kit'); give('reload_press'); give('manual_smith');
    for (const k of Object.keys(g.deep.skill)) g.deep.skill[k] = 0;
    g.deep.skill.carpentry = 24; g.deep.skill.mechanics = 28; g.deep.skill.fabrication = 20; g.deep.skill.firstaid = 12; g.deep.skill.cooking = 8;
    inv.changed();`);
  await call('step', { seconds: 1 });
  // 1. The pack, then the CRAFT tab with nothing set down: what a pair of hands can do
  await js('game.invUI.toggle(true);');
  await shot('01-pack-with-craft-tab');
  await js('game.craftUI.setTab(true);');
  await shot('02-craft-by-hand');
  // 2. Benches down beside the player (a forge, a workbench, a reloading press) and the world
  await js(`const p = game.player; for (const [i, b] of ['workbench', 'forge_kit', 'reload_press'].entries()) { const a = 0.4 + i * 2.09; game.crafting.place(b, { x: p.x + Math.cos(a) * 2.4, z: p.z + Math.sin(a) * 2.4 }); } game.invUI.toggle(false); game.craftUI.setTab(false); window.__pl = game.crafting.placed.map((b) => b.bench).join();`);
  console.log('placed', await D.eval('window.__pl'));
  await call('step', { seconds: 1 });
  await call('screenshot', { x: 240, z: -330, zoom: 9 }).catch(() => {});
  await js(`const p = game.player, C = game.crafting; C.placed.forEach((b, i) => { const a = 0.4 + i * 2.09; b.x = p.x + Math.cos(a) * 2.4; b.z = p.z + Math.sin(a) * 2.4; C.meshes.get(b.id)?.position.set(b.x, 0, b.z); }); p.speed = 0; game.invUI.toggle(true); game.craftUI.setTab(true); game.craftUI.group = 0; game.craftUI.render();`);
  await shot('03-craft-at-the-benches');
  // 3. A recipe with a tool, a bench and a quality estimate, then the queue working
  await js(`const U = game.craftUI; U.group = 0; U.render(); U.sel = Math.max(0, U.rows.findIndex((r) => r.id === 'forge_hatchet')); U.render();`);
  await shot('04-hatchet-unknown-teacher');
  await js(`const U = game.craftUI; game.crafting.knowRecipe('forge_hatchet'); game.inventory.add(game.inventory.carried, 'hammer', 0); U.render();`);
  await shot('05-hatchet-known');
  await js(`const U = game.craftUI; ${recentre} U.make(); U.group = 0; U.render(); U.sel = Math.max(0, U.rows.findIndex((r) => r.id === 'load_pistol')); U.render(); U.make(); game.crafting.update(); game.sky.time = (game.sky.time + 0.12) % 24; game.crafting.update(); U.render();`);
  await shot('06-queue-working');
  await js(`${recentre} const U = game.craftUI; U.group = 0; U.render(); U.sel = U.rows.findIndex((r) => r.id === 'make_planks'); U.render();`);
  await shot('07-missing-inputs-in-red');
  await js('game.craftUI.setTab(false); game.invUI.toggle(false);');
  await call('step', { seconds: 1 });
  await shot('08-benches-in-the-world');
} finally { await h.stop?.(); }
