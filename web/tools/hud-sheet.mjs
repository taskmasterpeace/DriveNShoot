#!/usr/bin/env node
// THE HUD SHEET (docs/design/WEB_UI_EDITOR.md): the standard HUD layout documented from the GAME, in a real headless Chrome
// (the DOM HUD is in these, unlike `screenshot`). Edit mode with every element's name on, once per preset and once per
// situation, the editor panel itself, the live HUD on foot and at the wheel, the old size beside the new, and the layout
// at 1280x720 and 2560x1440. Writes docs/renders/web/ui-editor/*.png and INDEX.md (every element, its corner, where it
// shows).
//   DL_URL=http://localhost:3466 node tools/hud-sheet.mjs [--size 1600x900] [--only preset,situation,live,editor,sizes]
// Uses the dev server already up at DL_URL (or starts one), its own throwaway Chrome profile, and stops exactly what it
// started (by PID). The player's saved layout in that profile is thrown away with it.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';
import { HUD_LAYOUT, HUD_PRESETS, PRESET_IDS, SITUATIONS, SITUATION_IDS, ANCHORS } from '../src/data/hudlayout.js';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const [W, H] = arg('--size', '1600x900').split('x').map(Number);
const ONLY = arg('--only', '');
const want = (k) => !ONLY || ONLY.split(',').includes(k);
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'ui-editor');
mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?agent=0', width: W, height: H, log: console.log });
const D = await cdp(h);
const size = async (w, hh) => { await D.send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: 1, mobile: false }); await sleep(600); await D.eval('(() => { dispatchEvent(new Event("resize")); return true; })()'); };
await size(W, H);
const until = async (expr, ms = 90000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const call = async (cmd, args = {}) => JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`));
const shots = [];
const shot = async (name, caption) => { await sleep(800); const f = join(OUT, `${name}.png`); await D.shot(f); shots.push([name, caption]); console.log('wrote', f); };
const hud = (args) => call('hudLayout', args);

try {
  await until('window.game && game.hud && game.hud.layout');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: 0, z: -40 });
  await call('give', { weapon: 'smg', smg: 128 }); await call('equip', { weapon: 'smg' });
  await call('step', { seconds: 1.5 });
  await D.eval('(() => { game.hud.toast("Picked up 30 rounds"); game.hud.toast("The Dustwolves remember you", "warn"); return true; })()');
  await hud({ action: 'preset', name: 'default' });

  if (want('live')) {
    // the HUD as it plays: the old size, then the new Default, on foot
    await D.eval('(() => { game.qol.settings.hudScale = 4 / 3; game.hud.rescale(); return true; })()'); // 4/3 x Default's 0.75 = the old 1.0
    await shot('live-0-old-size', 'BEFORE: the HUD at its old size (one scale, 1.0 at 1600x900)');
    await D.eval('(() => { game.qol.settings.hudScale = 1; game.hud.rescale(); return true; })()');
    await shot('live-1-default', 'AFTER: the Default layout, three quarters of the old size, on foot');
    // at the wheel: a real car, the dash replaces the gun plate
    const v = await call('spawnVehicle', { type: 'interceptor' });
    await call('enterVehicle', { id: v.id ?? v.vehicle?.id, force: true });
    await call('step', { seconds: 1 });
    await shot('live-2-driving', 'AFTER: Default at the wheel (the speedometer and dash in the gun plate\'s corner)');
    await call('exitVehicle', {});
    await call('step', { seconds: 1 });
  }

  if (want('preset')) {
    for (const p of PRESET_IDS) {
      await hud({ action: 'preset', name: p });
      await hud({ action: 'edit', on: true, panel: false });
      await hud({ action: 'situation', name: 'on_foot' });
      await shot(`preset-${p}`, `PRESET ${HUD_PRESETS[p].name.toUpperCase()} (scale ${HUD_PRESETS[p].scale}): ${HUD_PRESETS[p].blurb}. Edit mode, names on.`);
      await hud({ action: 'edit', on: false });
    }
    await hud({ action: 'preset', name: 'default' });
  }

  if (want('situation')) {
    for (const s of SITUATION_IDS) {
      if (s === 'night') { await call('setTime', { hour: 23 }); await call('step', { seconds: 0.5 }); }
      await hud({ action: 'edit', on: true, panel: false });
      await hud({ action: 'situation', name: s });
      await shot(`situation-${s}`, `SITUATION ${SITUATIONS[s].name.toUpperCase()}: ${SITUATIONS[s].blurb}. Default, edit mode, names on.`);
      await hud({ action: 'edit', on: false });
      if (s === 'night') { await call('setTime', { hour: 10 }); await call('step', { seconds: 0.5 }); }
    }
  }

  if (want('editor')) {
    await hud({ action: 'edit', on: true, panel: true });
    await D.eval('(() => { game.hud.editor.select("cash"); return true; })()');
    await shot('editor-panel', 'THE EDITOR: F6 or EDIT HUD LAYOUT in the pause menu. Cash plate selected (its grip, the anchor grid, size, visible, situation).');
    await hud({ action: 'edit', on: false });
  }

  if (want('sizes')) {
    for (const [w, hh] of [[1280, 720], [2560, 1440]]) {
      await size(w, hh);
      await hud({ action: 'edit', on: true, panel: false });
      await hud({ action: 'situation', name: 'on_foot' });
      await shot(`size-${w}x${hh}`, `Default at ${w}x${hh}: anchored, every element on screen.`);
      await hud({ action: 'edit', on: false });
    }
    await size(W, H);
  }

  // INDEX.md: the element list (the standard names) and the sheet.
  const S = SITUATION_IDS;
  const lines = [
    '# HUD layout sheet', '',
    `Generated by \`web/tools/hud-sheet.mjs\` from the game at ${W}x${H} (docs/design/WEB_UI_EDITOR.md). Rows: \`web/src/data/hudlayout.js\`.`, '',
    '## The elements (the standard names)', '',
    `| id | name | hangs from | ${S.map((s) => SITUATIONS[s].name).join(' | ')} |`, `|---|---|---|${S.map(() => '---').join('|')}|`,
    ...HUD_LAYOUT.map((r) => `| \`${r.id}\` | ${r.name} | ${r.anchor === 'mouse' ? 'the pointer' : ANCHORS[r.anchor].name} | ${S.map((s) => (r.situations.includes(s) ? '●' : '')).join(' | ')} |`),
    '', '## The shots', '',
    ...shots.map(([n, c]) => `- **${n}.png**: ${c}\n\n  ![${n}](${n}.png)`), '',
  ];
  writeFileSync(join(OUT, 'INDEX.md'), lines.join('\n'));
  console.log('wrote', join(OUT, 'INDEX.md'));
} finally {
  h.stop();
}
