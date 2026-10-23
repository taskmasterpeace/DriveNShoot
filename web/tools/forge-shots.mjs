#!/usr/bin/env node
// Screenshots of THE WORLD FORGE (forge.html, docs/design/WEB_FORGE.md) from a private headless Chrome over the DevTools
// protocol (the observer-shots.mjs pattern: no Playwright, no window). Each step runs JS in the page (window.FORGE is
// its handle), waits, and saves a PNG (or a JPEG with a .jpg name).
//
//   node tools/forge-shots.mjs --out ../docs/renders/web/forge \
//     --step 01-map-usa "FORGE.show('map'); FORGE.map.fitUSA()" 2500 \
//     --step 02-brush "FORGE.show('brush')" 3000
//
// Env: DL_URL (default http://localhost:3141), DL_BROWSER. Flags: --w 1720 --h 1040 --tab <game tab id> --hash <tab>.
// The browser gets its own temp profile (prefix forgeshot-) and is closed by its own PID when the script ends.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const BASE = process.env.DL_URL ?? 'http://localhost:3141';
const argv = process.argv.slice(2), opt = { w: 1720, h: 1040, out: 'shots', tab: '', hash: 'map' }, steps = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--step') { steps.push({ name: argv[i + 1], js: argv[i + 2] ?? '', wait: Number(argv[i + 3] ?? 1500) }); i += 3; }
  else if (argv[i].startsWith('--')) { opt[argv[i].slice(2)] = argv[i + 1]; i++; }
}
if (!steps.length) steps.push({ name: 'forge', js: '', wait: 2500 });
const exe = [process.env.DL_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
if (!exe) { console.error('no Chrome/Edge found (set DL_BROWSER)'); process.exit(2); }
const port = 9700 + Math.floor(Math.random() * 250);
const profile = mkdtempSync(join(tmpdir(), 'forgeshot-'));
const url = `${BASE}/forge.html${opt.tab ? `?tab=${opt.tab}` : ''}#${opt.hash}`;
const chrome = spawn(exe, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, `--window-size=${opt.w},${opt.h}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', '--no-default-browser-check', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--enable-gpu', '--use-angle=default', '--ignore-gpu-blocklist', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const done = (code) => { try { chrome.kill(); } catch {} process.exit(code); };

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {}
}
if (!target) { console.error('headless browser did not come up'); done(2); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0; const waiting = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); } };
const send = (method, params = {}) => new Promise((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
};
await send('Emulation.setDeviceMetricsOverride', { width: +opt.w, height: +opt.h, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url });
let ok = false;
for (let i = 0; i < 120 && !ok; i++) { await sleep(250); try { ok = await evaluate('return !!(window.FORGE && FORGE.ready)'); } catch {} }
if (!ok) { console.error(`the forge never became ready (${url}): ${await evaluate('return window.FORGE?.error ?? null').catch(() => '?')}`); done(1); }
await sleep(1200);
const out = resolve(opt.out);
mkdirSync(out, { recursive: true });
for (const s of steps) {
  try { if (s.js) { const v = await evaluate(s.js); if (v !== undefined) console.log(`${s.name}: ${JSON.stringify(v).slice(0, 300)}`); } } catch (e) { console.error(`${s.name}: ${e.message}`); }
  await sleep(s.wait);
  const jpg = s.name.endsWith('.jpg');
  const shot = await send('Page.captureScreenshot', jpg ? { format: 'jpeg', quality: 88 } : { format: 'png' });
  const file = join(out, jpg ? s.name : `${s.name}.png`);
  writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
  console.log(`wrote ${file}`);
}
ws.close();
done(0);
