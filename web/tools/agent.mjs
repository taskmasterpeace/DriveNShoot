#!/usr/bin/env node
// One command for a fully shell-driven session: dev server + headless browser running the game.
//   npm run agent                (run it in the background; Ctrl+C stops both)
//   npm run agent -- --new-tab   (a person is playing in another tab: launch a private headless tab;
//                                 the bridge drives the newest tab, theirs goes to standby untouched)
// Then: node tools/dl.mjs selftest
// Env: DL_BROWSER=<path to chrome/edge>, DL_HEADED=1 to show the window.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 3141;
const BASE = `http://localhost:${PORT}`;
const kids = [];
const stop = () => { for (const k of kids) try { k.kill(); } catch {} process.exit(0); };
process.on('SIGINT', stop); process.on('SIGTERM', stop);

const up = async () => { try { return (await fetch(`${BASE}/agent/status`)).ok; } catch { return false; } };
const connected = async () => { try { return (await (await fetch(`${BASE}/agent/status`)).json()).connected; } catch { return false; } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!(await up())) {
  console.log('[agent] starting vite dev server...');
  const root = fileURLToPath(new URL('..', import.meta.url));
  const v = spawn(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), '--port', String(PORT), '--strictPort'], { stdio: 'ignore', cwd: root });
  kids.push(v);
  for (let i = 0; i < 120 && !(await up()); i++) await sleep(500);
  if (!(await up())) { console.error('[agent] dev server did not come up'); stop(); }
} else console.log('[agent] dev server already running');

const NEW_TAB = process.argv.includes('--new-tab');
const tabs = async () => { try { return (await (await fetch(`${BASE}/agent/status`)).json()).tabs ?? 0; } catch { return 0; } };
if (await connected() && !NEW_TAB) {
  console.log('[agent] a game tab is already connected — nothing to launch. Ready. (--new-tab launches a private one)');
} else {
  const before = await tabs();
  const candidates = [
    process.env.DL_BROWSER,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const exe = candidates.find((p) => existsSync(p));
  if (!exe) { console.error('[agent] no Chrome/Edge found; set DL_BROWSER or open', `${BASE}/?agent=1`, 'yourself'); }
  else {
    const profile = mkdtempSync(join(tmpdir(), 'dsoa-'));
    const args = [
      ...(process.env.DL_HEADED ? [] : ['--headless=new']),
      '--enable-gpu', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
      '--window-size=1280,720', '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      `--user-data-dir=${profile}`, `${BASE}/?agent=1`,
    ];
    console.log(`[agent] launching ${exe.split(/[\\/]/).pop()} ${process.env.DL_HEADED ? '(headed)' : '(headless)'}`);
    kids.push(spawn(exe, args, { stdio: 'ignore' }));
    for (let i = 0; i < 60 && (await tabs()) <= before; i++) await sleep(500);
    if ((await tabs()) <= before) { console.error('[agent] browser did not connect to the bridge'); stop(); }
  }
  console.log('[agent] READY — try: node tools/dl.mjs selftest');
}
// Stay alive while children run.
setInterval(() => {}, 1 << 30);
