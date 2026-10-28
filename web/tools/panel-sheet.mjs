#!/usr/bin/env node
// THE PANEL SHEET (docs/design/WEB_UI_EDITOR.md §3.8): every full screen from the GAME in a real headless Chrome (the DOM is
// in these, unlike `screenshot`), opened the way the editor opens it (ui/panellayout.js), and the text-overlap audit run on
// it at each size. Writes docs/renders/web/ui-editor/panels/<panel>-<tag>[-<W>x<H>].png, <panel>-names.png (edit mode,
// every region named) and audit-<tag>.json; exits 1 if any panel has crossing text at any size.
//   DL_URL=http://localhost:3466 node tools/panel-sheet.mjs [--tag after] [--sizes 1600x900,1280x720,2560x1440] [--only workshop,pack] [--names]
// Uses the dev server at DL_URL (or starts one), its own throwaway Chrome profile, and stops exactly what it started.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, startHarness, cdp, sleep } from './shard-kit.mjs';
import { PANEL_IDS } from '../src/data/panellayout.js';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const PORT = Number(new URL(BASE).port) || 3141;
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const TAG = arg('--tag', 'after');
const SIZES = arg('--sizes', '1600x900,1280x720,2560x1440').split(',').map((s) => s.split('x').map(Number));
const ONLY = arg('--only', '').split(',').filter(Boolean);
const NAMES = process.argv.includes('--names');
const OUT = join(ROOT, '..', 'docs', 'renders', 'web', 'ui-editor', 'panels');
mkdirSync(OUT, { recursive: true });

const [W0, H0] = SIZES[0];
const h = await startHarness(PORT, { path: '/?agent=0', width: W0, height: H0, log: console.log });
const D = await cdp(h);
const size = async (w, hh) => { await D.send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: 1, mobile: false }); await sleep(500); await D.eval('(() => { dispatchEvent(new Event("resize")); return true; })()'); await sleep(400); };
const until = async (expr, ms = 90000) => { for (let t = 0; t < ms; t += 250) { if (await D.eval(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true; await sleep(250); } throw new Error(`timed out: ${expr}`); };
const call = async (cmd, args = {}) => JSON.parse(await D.eval(`(async () => JSON.stringify(await game.api.call(${JSON.stringify(cmd)}, ${JSON.stringify(args)})))()`));
const audit = {};
let bad = 0;

try {
  await until('window.game && game.hud && game.hud.panels');
  await sleep(1500);
  await call('start'); await call('god', { on: true });
  await call('setTime', { hour: 10 }); await call('setWeather', { key: 'CLEAR', instant: true });
  await call('teleport', { x: 0, z: -40 });
  await call('give', { weapon: 'smg', smg: 128 }); await call('equip', { weapon: 'smg' });
  for (const row of ['wheelboss', 'quartermaster']) await call('crewJoin', { spawn: row }).catch(() => null);
  await call('step', { seconds: 1.5 });
  for (const pid of PANEL_IDS) {
    if (ONLY.length && !ONLY.includes(pid)) continue;
    for (const [w, hh] of SIZES) {
      await size(w, hh);
      const r = JSON.parse(await D.eval(`(() => { const P = game.hud.panels; const r = P.open(${JSON.stringify(pid)}, { tab: 1 }); return JSON.stringify(r); })()`));
      if (!r.ok) { console.log(`${pid}: could not open (${r.why ?? '?'})`); audit[pid] = { error: r.why }; break; }
      await sleep(900);
      const name = `${pid}-${TAG}${w === W0 && hh === H0 ? '' : `-${w}x${hh}`}`;
      await D.shot(join(OUT, `${name}.png`)); console.log('wrote', name);
      const hits = JSON.parse(await D.eval(`(async () => { const m = await import('/src/ui/panellayout.js'); return JSON.stringify(m.textOverlaps(game.hud.panels.rootEl(${JSON.stringify(pid)}))); })()`));
      (audit[pid] ??= {})[`${w}x${hh}`] = hits;
      if (hits.length) { bad++; console.log(`  ${pid} ${w}x${hh}: ${hits.length} crossing text pairs, worst ${JSON.stringify(hits[0])}`); }
      if (NAMES && w === W0 && hh === H0) {
        await D.eval(`(() => { game.hud.editor.show(); game.hud.editor.screen(${JSON.stringify(pid)}); return true; })()`);
        await sleep(900);
        await D.shot(join(OUT, `${pid}-names.png`)); console.log('wrote', `${pid}-names`);
        await D.eval('(() => { game.hud.editor.hide(); return true; })()');
        await sleep(300);
        await D.eval(`(() => { game.hud.panels.open(${JSON.stringify(pid)}, { tab: 1 }); return true; })()`);
      }
      await D.eval(`(() => { game.hud.panels.close(${JSON.stringify(pid)}); return true; })()`);
      await sleep(300);
    }
  }
  writeFileSync(join(OUT, `audit-${TAG}.json`), JSON.stringify(audit, null, 1));
  console.log(bad ? `AUDIT: ${bad} panel/size combinations with crossing text` : 'AUDIT: no crossing text in any panel at any size');
} finally {
  h.stop();
}
process.exit(bad && TAG !== 'before' ? 1 : 0);
