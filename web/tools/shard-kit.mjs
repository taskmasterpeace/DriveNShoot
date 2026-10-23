// Shared pieces for the shard tools (tools/shard.mjs, tools/shard-test.mjs): start a shard, start a game harness (Vite +
// a headless Chrome on its own port and its own throwaway profile), drive a page through its agent bridge, look at it
// through the Chrome DevTools protocol (a real screenshot: the DOM HUD and the login modal are in it), and stop exactly
// what was started (by PID, with its process tree; never by name or pattern).
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { request } from 'node:http';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const DEV_FILE = join(ROOT, 'server', '.dev-accounts.json');

export function devAccount(user) {
  if (!existsSync(DEV_FILE)) throw new Error(`no ${DEV_FILE} - run: node server/seed-dev.mjs (with the shard stopped)`);
  const a = JSON.parse(readFileSync(DEV_FILE, 'utf8')).accounts.find((x) => x.user === user);
  if (!a) throw new Error(`no dev account "${user}" in ${DEV_FILE}`);
  return a;
}

// Kill one process and its children, by its exact PID.
export function stopTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {}
}

// ---- the shard --------------------------------------------------------------------------------------------------------
export async function startShard({ port = 3280, data, log } = {}) {
  const args = [join(ROOT, 'server', 'shard.mjs'), '--port', String(port)];
  if (data) args.push('--data', data);
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
  const out = [];
  const take = (b) => { for (const line of b.toString().split(/\r?\n/)) if (line) { out.push(line); log?.(line); } };
  child.stdout.on('data', take); child.stderr.on('data', take);
  for (let i = 0; i < 60; i++) {
    if (await health(port)) return { child, port, out, stop: () => stopShard(child) };
    if (child.exitCode !== null) throw new Error(`shard exited: ${out.slice(-3).join(' | ')}`);
    await sleep(250);
  }
  stopTree(child);
  throw new Error('shard did not come up');
}

// A graceful stop (the shard writes its files first), then the hard one if it hangs.
export async function stopShard(child) {
  if (child.exitCode !== null) return;
  const done = new Promise((r) => child.once('exit', r));
  try { child.send('shutdown'); } catch {}
  await Promise.race([done, sleep(5000)]);
  stopTree(child);
}

export async function health(port = 3280) {
  try { const r = await fetch(`http://localhost:${port}/health`); return r.ok ? await r.json() : null; } catch { return null; }
}
export async function shardGet(path, port = 3280) { return fetch(`http://localhost:${port}${path}`).then((r) => r.json()); }

// ---- a game harness ---------------------------------------------------------------------------------------------------
const BROWSERS = [process.env.DL_BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);

export async function startHarness(port, { path = '/?agent=1', width = 1600, height = 900, log } = {}) {
  const base = `http://localhost:${port}`;
  const kids = [];
  if (!(await bridgeUp(base))) {
    const v = spawn(process.execPath, [join(ROOT, 'node_modules/vite/bin/vite.js'), '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
    kids.push(v);
    for (let i = 0; i < 120 && !(await bridgeUp(base)); i++) await sleep(500);
    if (!(await bridgeUp(base))) throw new Error(`vite did not come up on ${port}`);
  } else log?.(`[harness ${port}] a dev server is already up there; using it`);
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error('no Chrome/Edge found (set DL_BROWSER)');
  const profile = mkdtempSync(join(tmpdir(), 'dsoa-shard-'));
  const chrome = spawn(exe, ['--headless=new', '--enable-gpu', '--use-angle=default', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist',
    `--window-size=${width},${height}`, '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--no-default-browser-check',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, `${base}${path}`], { stdio: 'ignore' });
  kids.push(chrome);
  for (let i = 0; i < 90 && !(await connected(base)); i++) await sleep(500);
  if (!(await connected(base))) { for (const k of kids) stopTree(k); throw new Error(`the game page on ${port} never reached its bridge`); }
  // The DevTools port Chrome picked.
  let devPort = null;
  for (let i = 0; i < 40 && !devPort; i++) { try { devPort = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]); } catch { await sleep(250); } }
  const h = { port, base, kids, profile, devPort, call: (cmd, args = {}) => pageCall(base, cmd, args), stop: () => { h.cdp?.close(); for (const k of kids.reverse()) stopTree(k); } };
  return h;
}

async function bridgeUp(base) { try { return (await fetch(`${base}/agent/status`)).ok; } catch { return false; } }
async function connected(base) { try { return (await (await fetch(`${base}/agent/status`)).json()).connected; } catch { return false; } }

// One agent command on that page (JSON in, JSON out). node:http, not fetch: a long command must not time out at 300 s.
export function pageCall(base, cmd, args = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ cmd, args });
    const req = request(`${base}/agent/cmd`, { method: 'POST', autoSelectFamily: true, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, (res) => {
      let s = ''; res.setEncoding('utf8'); res.on('data', (c) => { s += c; }); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } });
    });
    req.on('error', reject); req.end(data);
  });
}

// A fresh boot of the page (it re-reads nothing from the shard by itself), then wait until it answers again.
export async function reloadPage(h) {
  await pageCall(h.base, 'exec', { code: 'setTimeout(() => location.reload(), 50), true' }).catch(() => {});
  await sleep(1500);
  for (let i = 0; i < 120; i++) {
    try { const r = await pageCall(h.base, 'state'); if (r.ok) return r; } catch {}
    await sleep(500);
  }
  throw new Error(`page ${h.port} did not come back`);
}

// ---- looking at it: Chrome DevTools ------------------------------------------------------------------------------------
export async function cdp(h) {
  if (h.cdp) return h.cdp;
  const list = await fetch(`http://127.0.0.1:${h.devPort}/json`).then((r) => r.json());
  const page = list.find((t) => t.type === 'page' && t.url.startsWith(h.base)) ?? list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('devtools socket failed')); });
  let id = 0;
  const wait = new Map();
  ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const send = (method, params = {}) => new Promise((ok) => { const n = ++id; wait.set(n, ok); ws.send(JSON.stringify({ id: n, method, params })); });
  h.cdp = {
    send,
    close: () => { try { ws.close(); } catch {} },
    eval: async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value,
    shot: async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.result.data, 'base64')); return file; },
    navigate: async (url) => { await send('Page.navigate', { url }); },
  };
  return h.cdp;
}
