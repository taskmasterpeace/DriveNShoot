#!/usr/bin/env node
// THE BODY DOLL SHEET (docs/design/WEB_UI_EDITOR.md §3.9): shots from the GAME in a real headless Chrome (the DOM is in
// these, unlike `screenshot`). A hurt body (a broken left arm, a gashed right leg, a hit to the head) in the HUD; the PACK
// opening (the doll mid-lift); the PACK open with the ground, a body and a crate near your feet and your pockets, belt,
// vest and backpack; the same with every region named in the editor. Writes docs/renders/web/ui-editor/doll/*.png.
//   DL_URL=http://localhost:3466 node tools/doll-sheet.mjs [--sizes 1600x900,1280x720]
// Uses the dev server at DL_URL (or starts one), its own throwaway Chrome profile, and stops exactly what it started.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const SIZES = arg('--sizes', '1600x900,1280x720').split(',').map((s) => s.split('x').map(Number));
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'ui-editor', 'doll');
mkdirSync(OUT, { recursive: true });

const [W0, H0] = SIZES[0];
const h = await startHarness(PORT, { path: '/?agent=0', width: W0, height: H0, log: console.log });
const D = await cdp(h);
const size = async (w, hh) => { await D.send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: 1, mobile: false }); await sleep(500); await D.eval('(() => { dispatchEvent(new Event("resize")); return true; })()'); await sleep(500); };
const until = async (expr, ms = 120000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const call = async (cmd, args = {}) => JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`));
const js = async (body) => JSON.parse(await D.eval(`(async () => { const g = game; ${body} })()`) ?? 'null');

try {
  await until('window.game && game.hud && game.hud.doll');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: 0, z: -40 });
  await call('give', { weapon: 'smg', smg: 128 }); await call('equip', { weapon: 'smg' });
  await call('step', { seconds: 1 });
  // The hurt body: a broken left arm, a gashed right leg, a round to the head (god mode off for the hits, back on after).
  await js(`g.godMode = false; g.player.graceT = 0; g.survival.wound('fracture', { part: 'arm_l' }); g.survival.wound('laceration', { part: 'leg_r' });
    g.combat.damage(g.player, 22, null, 0, 0, 'bullet', 'head'); g.combat.damage(g.player, 9, null, 0, 0, 'bullet', 'torso'); g.player.hp = Math.max(g.player.hp, 40); g.godMode = true; g.hud.updateSlow(); return 'null';`);
  // Worn: a belt and a vest (their compartments), the starting pack.
  await js(`g.gear.put('utility_belt'); g.gear.put('soft_vest'); g.gear.recompute?.(); return 'null';`);
  // Near your feet: things on the ground, the dead with their kit, a crate.
  await js(`const inv = g.inventory, p = g.player, gr = inv.groundAt(p.x + 0.6, p.z);
    inv.add(gr, 'water_bottle', 2); inv.add(gr, 'bandage', 3); inv.add(gr, 'ammo_smg', 30);
    const c = g.addChar({ x: p.x + 1.4, z: p.z + 0.4, faction: 'raider', name: 'Dustwolf Scav', flag: 'MX', weapon: 'pistol' });
    await g.api.call('kill', { id: c.id });
    const body = inv.boxes.get('body:' + c.id); if (body) { inv.add(body, 'leather_vest', 1); inv.add(body, 'jerky', 2); }
    const crate = inv.place('crate:sheet', 'garage', p.x - 1.2, p.z + 0.8, 40, 'TOOL CRATE');
    return 'null';`);
  await call('step', { seconds: 1.5 });
  for (const [w, hh] of SIZES) {
    await size(w, hh);
    const tag = w === W0 && hh === H0 ? '' : `-${w}x${hh}`;
    await js('g.hud.updateSlow(); g.hud.layout.refresh?.(); return "null";'); await sleep(600);
    await D.shot(join(OUT, `hud-hurt${tag}.png`)); console.log('wrote hud-hurt' + tag);
    await js('g.invUI.toggle(true); return "null";'); await sleep(140);
    await D.shot(join(OUT, `pack-lifting${tag}.png`)); console.log('wrote pack-lifting' + tag);
    await sleep(900);
    await D.shot(join(OUT, `pack-open${tag}.png`)); console.log('wrote pack-open' + tag);
    if (!tag) {
      await js('g.invUI.toggle(false); g.hud.editor.show(); g.hud.editor.screen("pack"); return "null";'); await sleep(900);
      await D.shot(join(OUT, 'pack-names.png')); console.log('wrote pack-names');
      await js('g.hud.editor.hide(); return "null";'); await sleep(300);
      await js('g.hud.editor.show(); return "null";'); await sleep(900);
      await D.shot(join(OUT, 'hud-names.png')); console.log('wrote hud-names');
      await js('g.hud.editor.hide(); return "null";'); await sleep(300);
    } else { await js('g.invUI.toggle(false); return "null";'); await sleep(300); }
  }
} finally {
  h.stop();
}
process.exit(0);
