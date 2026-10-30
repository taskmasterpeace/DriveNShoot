#!/usr/bin/env node
// THE PLAYTEST FIXES SHEET (Robert's 2026-10-29 playtest): the after shots for the three fixes, from the GAME in a real
// headless Chrome. The HUD editor with an element picked (its plain name and the line on what it shows); the character
// screen's origin, attributes and kit steps; the CLICK TO RESUME note. Writes docs/renders/web/ui-editor/playtest/*.png
// (the before shots there are the committed renders from before the pass).
//   DL_URL=http://localhost:3466 node tools/playtest-sheet.mjs
// Uses the dev server at DL_URL (or starts one), its own throwaway Chrome profile, and stops exactly what it started.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'ui-editor', 'playtest');
mkdirSync(OUT, { recursive: true });

const h = await startHarness(PORT, { path: '/?agent=0', width: 1600, height: 900, log: console.log });
const D = await cdp(h);
const until = async (expr, ms = 120000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const call = async (cmd, args = {}) => JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`));
const js = async (body) => JSON.parse(await D.eval(`(async () => { const g = game; ${body} })()`) ?? 'null');
const shot = async (name) => { await D.shot(join(OUT, `${name}.png`)); console.log('wrote', name); };

try {
  await until('window.game && game.hud && game.creatorUI');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: 0, z: -40 });
  await call('step', { seconds: 1 });
  // 1. The HUD editor: an element picked shows its plain name and what it shows.
  await js('g.hud.editor.show(); g.hud.editor.select("roles"); return "null";'); await sleep(900);
  await shot('hud-editor-after');
  await js('g.hud.editor.select("telltales"); return "null";'); await sleep(500);
  await shot('hud-editor-after-2');
  await js('g.hud.editor.hide(); return "null";'); await sleep(400);
  // 2. The character screen: a made-up survivor from Nigeria, three steps.
  await js('g.creatorUI.open({}); g.creator.set({ name: "Ada Okafor", flag: "NG" }); g.creatorUI.refresh(); return "null";'); await sleep(1500);
  await shot('creator-origin-after');
  await js('g.creatorUI.goStep(2); return "null";'); await sleep(900);
  await shot('creator-attributes-after');
  await js('g.creatorUI.goStep(1); return "null";'); await sleep(900);
  await shot('creator-background-after');
  await js('g.creatorUI.goStep(5); return "null";'); await sleep(900);
  await shot('creator-kit-after');
  await js('g.creatorUI.close(false); g.paused = false; return "null";'); await sleep(500);
  // 3. The window lost the keys: the note (forced on: a headless tab never has focus, and an agent tab never shows it).
  await js('g.focus.note.classList.remove("hidden"); return "null";'); await sleep(400);
  await shot('focus-note');
  await js('g.focus.show(); return "null";');
} finally {
  h.stop();
}
process.exit(0);
